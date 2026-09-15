import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { cancelBookingRecord, getBookingById } from "./booking.controller";

const statusSchema = z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]);

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

const getPagination = (req: AuthRequest) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
};

export const getAdminBookingById = getBookingById;

export const getAdminBookings = async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const where: Prisma.BookingWhereInput = {};

    if (req.query.status !== undefined) {
      const result = statusSchema.safeParse(String(req.query.status));
      if (!result.success) {
        return res.status(400).json({ message: "Invalid booking status" });
      }
      where.status = result.data as BookingStatus;
    }

    if (req.query.paymentStatus !== undefined) {
      const paymentStatus = String(req.query.paymentStatus);
      if (!Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }
      where.paymentStatus = paymentStatus as PaymentStatus;
    }

    for (const field of ["flightId", "userId"] as const) {
      if (req.query[field] !== undefined) {
        const value = Number(req.query[field]);
        if (!Number.isInteger(value) || value < 1) {
          return res.status(400).json({ message: `Invalid ${field}` });
        }
        where[field] = value;
      }
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: bookingInclude,
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
    console.error("Get admin bookings error:", error);
    return res.status(500).json({ message: "Failed to fetch bookings" });
  }
};

export const updateAdminBookingStatus = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const result = statusSchema.safeParse(req.body?.status);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid booking status",
        errors: result.error.issues,
      });
    }

    const nextStatus = result.data as BookingStatus;
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (existingBooking.status === BookingStatus.CANCELLED && nextStatus !== BookingStatus.CANCELLED) {
      return res.status(400).json({
        message: "Cancelled bookings cannot be reopened automatically",
      });
    }

    if (existingBooking.status === BookingStatus.COMPLETED && nextStatus === BookingStatus.CANCELLED) {
      return res.status(400).json({
        message: "Completed bookings cannot be cancelled",
      });
    }

    if (nextStatus === BookingStatus.CANCELLED && existingBooking.status !== BookingStatus.CANCELLED) {
      const cancelledBooking = await cancelBookingRecord(id);
      return res.json({
        message: "Booking status updated successfully",
        data: cancelledBooking,
      });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: nextStatus },
      include: bookingInclude,
    });

    return res.json({
      message: "Booking status updated successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Update admin booking status error:", error);
    return res.status(500).json({ message: "Failed to update booking status" });
  }
};
