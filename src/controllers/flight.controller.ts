import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

// GET /api/flights
export const getFlights = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const minPrice = req.query.minPrice
      ? Number(req.query.minPrice)
      : undefined;

    const maxPrice = req.query.maxPrice
      ? Number(req.query.maxPrice)
      : undefined;

    const airline = req.query.airline
      ? String(req.query.airline)
      : undefined;

    const where: Prisma.FlightWhereInput = {};

    if (minPrice !== undefined && !Number.isNaN(minPrice)) {
      where.price = {
        ...(where.price as Prisma.DecimalFilter ?? {}),
        gte: minPrice,
      };
    }

    if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
      where.price = {
        ...(where.price as Prisma.DecimalFilter ?? {}),
        lte: maxPrice,
      };
    }

    if (airline) {
      where.airline = {
        OR: [
          { code: airline },
          {
            name: {
              contains: airline,
            },
          },
        ],
      };
    }

    const [flights, total] = await Promise.all([
      prisma.flight.findMany({
        where,
        include: {
          airline: true,
          departureAirport: true,
          arrivalAirport: true,
        },
        orderBy: {
          departureTime: "asc",
        },
        skip,
        take: limit,
      }),

      prisma.flight.count({ where }),
    ]);

    return res.json({
      data: flights,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get flights error:", error);

    return res.status(500).json({
      message: "Failed to fetch flights",
    });
  }
};

// GET /api/flights/search
export const searchFlights = async (req: AuthRequest, res: Response) => {
  try {
    const from = req.query.from
      ? String(req.query.from).toUpperCase()
      : undefined;

    const to = req.query.to
      ? String(req.query.to).toUpperCase()
      : undefined;

    const departureDate = req.query.departureDate
      ? String(req.query.departureDate)
      : undefined;

    const passengers = req.query.passengers
      ? Number(req.query.passengers)
      : 1;

    const minPrice = req.query.minPrice
      ? Number(req.query.minPrice)
      : undefined;

    const maxPrice = req.query.maxPrice
      ? Number(req.query.maxPrice)
      : undefined;

    const airline = req.query.airline
      ? String(req.query.airline)
      : undefined;

    const sortBy = req.query.sortBy
      ? String(req.query.sortBy)
      : "departure";

    if (passengers < 1 || Number.isNaN(passengers)) {
      return res.status(400).json({
        message: "Passengers must be at least 1",
      });
    }

    const where: Prisma.FlightWhereInput = {};

    // Departure airport
    if (from) {
      where.departureAirport = {
        code: from,
      };
    }

    // Arrival airport
    if (to) {
      where.arrivalAirport = {
        code: to,
      };
    }

    // Departure date
    if (departureDate) {
      const date = new Date(departureDate);

      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({
          message: "Invalid departure date",
        });
      }

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      where.departureTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    // Available seats
    where.availableSeats = {
      gte: passengers,
    };

    // Price
    if (
      (minPrice !== undefined && !Number.isNaN(minPrice)) ||
      (maxPrice !== undefined && !Number.isNaN(maxPrice))
    ) {
      const priceFilter: Prisma.DecimalFilter = {};

      if (minPrice !== undefined && !Number.isNaN(minPrice)) {
        priceFilter.gte = minPrice;
      }

      if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
        priceFilter.lte = maxPrice;
      }

      where.price = priceFilter;
    }

    // Airline
    if (airline) {
      where.airline = {
        OR: [
          {
            code: airline.toUpperCase(),
          },
          {
            name: {
              contains: airline,
            },
          },
        ],
      };
    }

    // Sorting
    let orderBy: Prisma.FlightOrderByWithRelationInput;

    switch (sortBy) {
      case "cheapest":
        orderBy = {
          price: "asc",
        };
        break;

      case "expensive":
        orderBy = {
          price: "desc",
        };
        break;

      case "latest":
        orderBy = {
          departureTime: "desc",
        };
        break;

      case "departure":
      default:
        orderBy = {
          departureTime: "asc",
        };
        break;
    }

    const flights = await prisma.flight.findMany({
      where,
      include: {
        airline: true,
        departureAirport: true,
        arrivalAirport: true,
      },
      orderBy,
    });

    return res.json({
      data: flights,
      count: flights.length,
    });
  } catch (error) {
    console.error("Search flights error:", error);

    return res.status(500).json({
      message: "Failed to search flights",
    });
  }
};

// GET /api/flights/:id
export const getFlightById = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Invalid flight ID",
      });
    }

    const flight = await prisma.flight.findUnique({
      where: {
        id,
      },
      include: {
        airline: true,
        departureAirport: true,
        arrivalAirport: true,
      },
    });

    if (!flight) {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    return res.json({
      data: flight,
    });
  } catch (error) {
    console.error("Get flight error:", error);

    return res.status(500).json({
      message: "Failed to fetch flight",
    });
  }
};

// POST /api/flights
export const createFlight = async (req: AuthRequest, res: Response) => {
  try {
    const {
      flightNumber,
      airlineId,
      departureAirportId,
      arrivalAirportId,
      departureTime,
      arrivalTime,
      price,
      currency,
      totalSeats,
      availableSeats,
    } = req.body;

    if (
      !flightNumber ||
      !airlineId ||
      !departureAirportId ||
      !arrivalAirportId ||
      !departureTime ||
      !arrivalTime ||
      price === undefined ||
      !totalSeats ||
      availableSeats === undefined
    ) {
      return res.status(400).json({
        message: "All required flight fields must be provided",
      });
    }

    if (departureAirportId === arrivalAirportId) {
      return res.status(400).json({
        message: "Departure and arrival airports must be different",
      });
    }

    if (availableSeats > totalSeats) {
      return res.status(400).json({
        message: "Available seats cannot exceed total seats",
      });
    }

    if (availableSeats < 0 || totalSeats < 1) {
      return res.status(400).json({
        message: "Invalid seat values",
      });
    }

    const departure = new Date(departureTime);
    const arrival = new Date(arrivalTime);

    if (
      Number.isNaN(departure.getTime()) ||
      Number.isNaN(arrival.getTime())
    ) {
      return res.status(400).json({
        message: "Invalid departure or arrival time",
      });
    }

    if (arrival <= departure) {
      return res.status(400).json({
        message: "Arrival time must be after departure time",
      });
    }

    const airline = await prisma.airline.findUnique({
      where: {
        id: Number(airlineId),
      },
    });

    if (!airline) {
      return res.status(400).json({
        message: "Airline not found",
      });
    }

    const departureAirport = await prisma.airport.findUnique({
      where: {
        id: Number(departureAirportId),
      },
    });

    const arrivalAirport = await prisma.airport.findUnique({
      where: {
        id: Number(arrivalAirportId),
      },
    });

    if (!departureAirport || !arrivalAirport) {
      return res.status(400).json({
        message: "Airport not found",
      });
    }

    const flight = await prisma.flight.create({
      data: {
        flightNumber: String(flightNumber),
        airlineId: Number(airlineId),
        departureAirportId: Number(departureAirportId),
        arrivalAirportId: Number(arrivalAirportId),
        departureTime: departure,
        arrivalTime: arrival,
        price: Number(price),
        currency: currency || "USD",
        totalSeats: Number(totalSeats),
        availableSeats: Number(availableSeats),
      },
      include: {
        airline: true,
        departureAirport: true,
        arrivalAirport: true,
      },
    });

    return res.status(201).json({
      message: "Flight created successfully",
      data: flight,
    });
  } catch (error) {
    console.error("Create flight error:", error);

    return res.status(500).json({
      message: "Failed to create flight",
    });
  }
};

// PUT /api/flights/:id
export const updateFlight = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Invalid flight ID",
      });
    }

    const existingFlight = await prisma.flight.findUnique({
      where: {
        id,
      },
    });

    if (!existingFlight) {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    const {
      flightNumber,
      airlineId,
      departureAirportId,
      arrivalAirportId,
      departureTime,
      arrivalTime,
      price,
      currency,
      totalSeats,
      availableSeats,
    } = req.body;

    const data: Prisma.FlightUpdateInput = {};

    if (flightNumber !== undefined) {
      data.flightNumber = String(flightNumber);
    }

    if (airlineId !== undefined) {
      data.airline = {
        connect: {
          id: Number(airlineId),
        },
      };
    }

    if (departureAirportId !== undefined) {
      data.departureAirport = {
        connect: {
          id: Number(departureAirportId),
        },
      };
    }

    if (arrivalAirportId !== undefined) {
      data.arrivalAirport = {
        connect: {
          id: Number(arrivalAirportId),
        },
      };
    }

    if (departureTime !== undefined) {
      data.departureTime = new Date(departureTime);
    }

    if (arrivalTime !== undefined) {
      data.arrivalTime = new Date(arrivalTime);
    }

    if (price !== undefined) {
      data.price = Number(price);
    }

    if (currency !== undefined) {
      data.currency = String(currency);
    }

    if (totalSeats !== undefined) {
      data.totalSeats = Number(totalSeats);
    }

    if (availableSeats !== undefined) {
      data.availableSeats = Number(availableSeats);
    }

    const updatedFlight = await prisma.flight.update({
      where: {
        id,
      },
      data,
      include: {
        airline: true,
        departureAirport: true,
        arrivalAirport: true,
      },
    });

    return res.json({
      message: "Flight updated successfully",
      data: updatedFlight,
    });
  } catch (error) {
    console.error("Update flight error:", error);

    return res.status(500).json({
      message: "Failed to update flight",
    });
  }
};

// DELETE /api/flights/:id
export const deleteFlight = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        message: "Invalid flight ID",
      });
    }

    const flight = await prisma.flight.findUnique({
      where: {
        id,
      },
    });

    if (!flight) {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    await prisma.flight.delete({
      where: {
        id,
      },
    });

    return res.json({
      message: "Flight deleted successfully",
    });
  } catch (error) {
    console.error("Delete flight error:", error);

    return res.status(500).json({
      message: "Failed to delete flight",
    });
  }
};