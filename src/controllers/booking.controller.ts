import { randomBytes } from "crypto";
import { Prisma, BookingStatus } from "@prisma/client";
import { Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

const passengerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date of birth")
    .transform((value) => new Date(value)),
  gender: z.string().trim().min(1, "Gender is required"),
  nationality: z.string().trim().min(1, "Nationality is required"),
  passportNumber: z.string().trim().min(1, "Passport number is required"),
});

const createBookingSchema = z.object({
  flightId: z.number().int().positive("Invalid flight ID"),
  adults: z.number().int().min(0, "Adults cannot be negative"),
  children: z.number().int().min(0, "Children cannot be negative"),
  infants: z.number().int().min(0, "Infants cannot be negative"),
  passengers: z.array(passengerSchema).min(1, "At least one passenger is required"),
});

const bookingInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  flight: {
    include: {
      airline: true,
      departureAirport: true,
      arrivalAirport: true,
    },
  },
  passengers: true,
};

const bookingSummaryInclude = {
  flight: {
    include: {
      airline: true,
      departureAirport: true,
      arrivalAirport: true,
    },
  },
  passengers: true,
};

const getPagination = (req: AuthRequest) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
};

const generateBookingReference = () =>
  `BK-${randomBytes(4).toString("hex").toUpperCase()}`;

const hasDuplicatePassportNumbers = (
  passengers: Array<{ passportNumber: string }>
) => {
  const passportNumbers = passengers.map((passenger) => passenger.passportNumber);
  return new Set(passportNumbers).size !== passportNumbers.length;
};

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export const cancelBookingRecord = async (bookingId: number) =>
  prisma.$transaction(async (transaction) => {
    const existingBooking = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        flightId: true,
        status: true,
        totalPassengers: true,
      },
    });

    if (!existingBooking) {
      throw new Error("BOOKING_NOT_FOUND");
    }

    if (existingBooking.status === BookingStatus.CANCELLED) {
      throw new Error("BOOKING_ALREADY_CANCELLED");
    }

    if (existingBooking.status === BookingStatus.COMPLETED) {
      throw new Error("COMPLETED_BOOKING");
    }

    const updatedBooking = await transaction.booking.updateMany({
      where: {
        id: bookingId,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
      data: {
        status: BookingStatus.CANCELLED,
      },
    });

    if (updatedBooking.count !== 1) {
      throw new Error("BOOKING_ALREADY_CANCELLED");
    }

    await transaction.flight.update({
      where: { id: existingBooking.flightId },
      data: {
        availableSeats: {
          increment: existingBooking.totalPassengers,
        },
      },
    });

    return transaction.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: bookingInclude,
    });
  });

export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const result = createBookingSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues,
      });
    }

    const { flightId, adults, children, infants, passengers } = result.data;
    const totalPassengers = adults + children + infants;

    if (adults < 1) {
      return res.status(400).json({ message: "At least one adult is required" });
    }

    if (passengers.length !== totalPassengers) {
      return res.status(400).json({
        message: "Passenger count must equal adults, children, and infants",
      });
    }

    if (hasDuplicatePassportNumbers(passengers)) {
      return res.status(400).json({
        message: "Passport numbers must be unique within a booking",
      });
    }

    const flight = await prisma.flight.findUnique({
      where: { id: flightId },
      select: { id: true },
    });

    if (!flight) {
      return res.status(404).json({ message: "Flight not found" });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const booking = await prisma.$transaction(async (transaction) => {
          const currentFlight = await transaction.flight.findUnique({
            where: { id: flightId },
            select: { price: true, currency: true },
          });

          if (!currentFlight) {
            throw new Error("FLIGHT_NOT_FOUND");
          }

          const reservedSeats = await transaction.flight.updateMany({
            where: {
              id: flightId,
              availableSeats: { gte: totalPassengers },
            },
            data: {
              availableSeats: { decrement: totalPassengers },
            },
          });

          if (reservedSeats.count !== 1) {
            throw new Error("INSUFFICIENT_SEATS");
          }

          return transaction.booking.create({
            data: {
              bookingReference: generateBookingReference(),
              userId: req.user!.userId,
              flightId,
              adults,
              children,
              infants,
              totalPassengers,
              totalPrice: new Prisma.Decimal(currentFlight.price).mul(totalPassengers),
              currency: currentFlight.currency,
              passengers: {
                create: passengers,
              },
            },
            include: bookingInclude,
          });
        });

        return res.status(201).json({
          message: "Booking created successfully",
          data: booking,
        });
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 2) {
          continue;
        }

        if (error instanceof Error && error.message === "INSUFFICIENT_SEATS") {
          return res.status(400).json({ message: "Insufficient seats available" });
        }

        if (error instanceof Error && error.message === "FLIGHT_NOT_FOUND") {
          return res.status(404).json({ message: "Flight not found" });
        }

        throw error;
      }
    }

    return res.status(409).json({ message: "Could not generate a unique booking reference" });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({ message: "Failed to create booking" });
  }
};

export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { page, limit, skip } = getPagination(req);
    const where = { userId: req.user.userId };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: bookingSummaryInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    return res.json({
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    return res.status(500).json({ message: "Failed to fetch bookings" });
  }
};

export const getBookingById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (req.user.role !== "ADMIN" && booking.userId !== req.user.userId) {
      return res.status(403).json({ message: "You cannot access this booking" });
    }

    return res.json({ data: booking });
  } catch (error) {
    console.error("Get booking error:", error);
    return res.status(500).json({ message: "Failed to fetch booking" });
  }
};

export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (req.user.role !== "ADMIN" && booking.userId !== req.user.userId) {
      return res.status(403).json({ message: "You cannot cancel this booking" });
    }

    const cancelledBooking = await cancelBookingRecord(id);
    return res.json({
      message: "Booking cancelled successfully",
      data: cancelledBooking,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "BOOKING_ALREADY_CANCELLED") {
        return res.status(400).json({ message: "Booking is already cancelled" });
      }

      if (error.message === "COMPLETED_BOOKING") {
        return res.status(400).json({ message: "Completed bookings cannot be cancelled" });
      }
    }

    console.error("Cancel booking error:", error);
    return res.status(500).json({ message: "Failed to cancel booking" });
  }
};
