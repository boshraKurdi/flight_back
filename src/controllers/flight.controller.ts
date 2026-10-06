import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

const flightDetailsInclude = {
  airline: true,
  departureAirport: true,
  arrivalAirport: true,
} satisfies Prisma.FlightInclude;

type FlightWithDetails = Prisma.FlightGetPayload<{
  include: typeof flightDetailsInclude;
}>;

type FlightWithChain = Omit<FlightWithDetails, "nextFlight"> & {
  nextFlight: FlightWithChain | null;
};

type NewFlightData = {
  flightNumber: string;
  airlineId: number;
  departureAirportId: number;
  arrivalAirportId: number;
  departureTime: Date;
  arrivalTime: Date;
  price: number;
  currency: string;
  totalSeats: number;
  availableSeats: number;
  status: FlightStatusValue;
};

const flightStatuses = ["SCHEDULED", "DELAYED", "CANCELLED", "COMPLETED"] as const;
type FlightStatusValue = (typeof flightStatuses)[number];

const normalizeFlightStatus = (value: unknown): FlightStatusValue | null => {
  if (value === undefined) return "SCHEDULED";
  return flightStatuses.find((candidate) => candidate === value) ?? null;
};

const normalizeFlightInput = (input: unknown): NewFlightData | string => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "Flight details must be an object";
  }

  const values = input as Record<string, unknown>;
  const requiredFields = [
    "flightNumber",
    "airlineId",
    "departureAirportId",
    "arrivalAirportId",
    "departureTime",
    "arrivalTime",
    "price",
    "totalSeats",
    "availableSeats",
  ];

  if (
    requiredFields.some(
      (field) =>
        values[field] === undefined ||
        values[field] === null ||
        values[field] === "",
    )
  ) {
    return "All required flight fields must be provided";
  }

  const airlineId = Number(values.airlineId);
  const departureAirportId = Number(values.departureAirportId);
  const arrivalAirportId = Number(values.arrivalAirportId);
  const price = Number(values.price);
  const totalSeats = Number(values.totalSeats);
  const availableSeats = Number(values.availableSeats);
  const departureTime = new Date(String(values.departureTime));
  const arrivalTime = new Date(String(values.arrivalTime));
  const status = normalizeFlightStatus(values.status);

  if (
    !Number.isInteger(airlineId) ||
    airlineId < 1 ||
    !Number.isInteger(departureAirportId) ||
    departureAirportId < 1 ||
    !Number.isInteger(arrivalAirportId) ||
    arrivalAirportId < 1
  ) {
    return "Airline and airport IDs must be positive integers";
  }

  if (departureAirportId === arrivalAirportId) {
    return "Departure and arrival airports must be different";
  }

  if (
    !Number.isFinite(price) ||
    !Number.isInteger(totalSeats) ||
    !Number.isInteger(availableSeats)
  ) {
    return "Invalid price or seat values";
  }

  if (availableSeats > totalSeats) {
    return "Available seats cannot exceed total seats";
  }

  if (availableSeats < 0 || totalSeats < 1) {
    return "Invalid seat values";
  }

  if (!status) {
    return "Invalid flight status";
  }

  if (
    Number.isNaN(departureTime.getTime()) ||
    Number.isNaN(arrivalTime.getTime())
  ) {
    return "Invalid departure or arrival time";
  }

  if (arrivalTime <= departureTime) {
    return "Arrival time must be after departure time";
  }

  return {
    flightNumber: String(values.flightNumber),
    airlineId,
    departureAirportId,
    arrivalAirportId,
    departureTime,
    arrivalTime,
    price,
    currency: values.currency ? String(values.currency) : "USD",
    totalSeats,
    availableSeats,
    status,
  };
};

const getFlightChainIds = async (
  client: Prisma.TransactionClient | typeof prisma,
  firstFlightId: number,
): Promise<number[]> => {
  const ids: number[] = [];
  const visitedIds = new Set<number>();
  let currentFlightId: number | null = firstFlightId;

  while (currentFlightId !== null && !visitedIds.has(currentFlightId)) {
    visitedIds.add(currentFlightId);

    const flight: { id: number; nextFlightId: number | null } | null =
      await client.flight.findUnique({
        where: { id: currentFlightId },
        select: { id: true, nextFlightId: true },
      });

    if (!flight) {
      break;
    }

    ids.push(flight.id);
    currentFlightId = flight.nextFlightId;
  }

  return ids;
};

const includeFlightChains = async (
  flights: FlightWithDetails[],
): Promise<FlightWithChain[]> => {
  const flightsById = new Map(flights.map((flight) => [flight.id, flight]));
  const loadedIds = new Set(flightsById.keys());
  let pendingIds = flights
    .map((flight) => flight.nextFlightId)
    .filter((id): id is number => id !== null && !loadedIds.has(id));

  while (pendingIds.length > 0) {
    const nextFlights = await prisma.flight.findMany({
      where: { id: { in: pendingIds } },
      include: flightDetailsInclude,
    });

    pendingIds = [];

    for (const flight of nextFlights) {
      if (loadedIds.has(flight.id)) {
        continue;
      }

      loadedIds.add(flight.id);
      flightsById.set(flight.id, flight);

      if (flight.nextFlightId !== null && !loadedIds.has(flight.nextFlightId)) {
        pendingIds.push(flight.nextFlightId);
      }
    }
  }

  const buildFlightChain = (
    flight: FlightWithDetails,
    visitedIds: Set<number>,
  ): FlightWithChain => {
    const visited = new Set(visitedIds);
    visited.add(flight.id);

    const nextFlight =
      flight.nextFlightId === null || visited.has(flight.nextFlightId)
        ? null
        : flightsById.get(flight.nextFlightId);

    return {
      ...flight,
      nextFlight: nextFlight
        ? buildFlightChain(nextFlight, visited)
        : null,
    };
  };

  return flights.map((flight) => buildFlightChain(flight, new Set()));
};

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
        include: flightDetailsInclude,
        orderBy: {
          departureTime: "asc",
        },
        skip,
        take: limit,
      }),

      prisma.flight.count({ where }),
    ]);

    return res.json({
      data: await includeFlightChains(flights),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get flights error:", error);

    const message = error instanceof Error ? error.message : String(error);

    return res.status(500).json({
      message,
    });
  }
};

// GET /api/flights/airports
export const getAirports = async (_req: AuthRequest, res: Response) => {
  try {
    const airports = await prisma.airport.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
    });

    return res.json({ data: airports });
  } catch (error) {
    console.error("Get airports error:", error);

    return res.status(500).json({
      message: "Failed to fetch airports",
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
      include: flightDetailsInclude,
      orderBy,
    });

    return res.json({
      data: await includeFlightChains(flights),
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
      include: flightDetailsInclude,
    });

    if (!flight) {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    return res.json({
      data: (await includeFlightChains([flight]))[0],
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
    if (req.body?.segments !== undefined) {
      if (!Array.isArray(req.body.segments) || req.body.segments.length < 1) {
        return res.status(400).json({
          message: "At least one flight segment is required",
        });
      }

      const segments: NewFlightData[] = [];

      for (const [index, segment] of req.body.segments.entries()) {
        const normalizedSegment = normalizeFlightInput(segment);

        if (typeof normalizedSegment === "string") {
          return res.status(400).json({
            message: `Invalid segment ${index + 1}: ${normalizedSegment}`,
          });
        }

        segments.push(normalizedSegment);
      }

      for (const [index, segment] of segments.entries()) {
        const [airline, departureAirport, arrivalAirport] = await Promise.all([
          prisma.airline.findUnique({
            where: { id: segment.airlineId },
            select: { id: true },
          }),
          prisma.airport.findUnique({
            where: { id: segment.departureAirportId },
            select: { id: true },
          }),
          prisma.airport.findUnique({
            where: { id: segment.arrivalAirportId },
            select: { id: true },
          }),
        ]);

        if (!airline) {
          return res.status(400).json({
            message: `Airline not found for segment ${index + 1}`,
          });
        }

        if (!departureAirport || !arrivalAirport) {
          return res.status(400).json({
            message: `Airport not found for segment ${index + 1}`,
          });
        }
      }

      const firstFlight = await prisma.$transaction(async (transaction) => {
        const createdFlights: Array<{ id: number }> = [];

        for (const segment of segments) {
          const createdFlight = await transaction.flight.create({
            data: segment,
            select: { id: true },
          });
          createdFlights.push(createdFlight);
        }

        for (let index = 0; index < createdFlights.length - 1; index += 1) {
          const currentFlight = createdFlights[index];
          const nextFlight = createdFlights[index + 1];

          if (!currentFlight || !nextFlight) {
            throw new Error("Failed to connect flight segments");
          }

          await transaction.flight.update({
            where: { id: currentFlight.id },
            data: { nextFlightId: nextFlight.id },
          });
        }

        const flight = await transaction.flight.findUnique({
          where: { id: createdFlights[0]!.id },
          include: flightDetailsInclude,
        });

        if (!flight) {
          throw new Error("Failed to load the created flight itinerary");
        }

        return flight;
      });

      return res.status(201).json({
        message: "Flight itinerary created successfully",
        data: (await includeFlightChains([firstFlight]))[0],
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
      status,
      nextFlightId,
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

    const normalizedStatus = normalizeFlightStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
        message: "Invalid flight status",
      });
    }

    let normalizedNextFlightId: number | null = null;

    if (nextFlightId !== undefined && nextFlightId !== null) {
      normalizedNextFlightId = Number(nextFlightId);

      if (
        !Number.isInteger(normalizedNextFlightId) ||
        normalizedNextFlightId < 1
      ) {
        return res.status(400).json({
          message: "Invalid next flight ID",
        });
      }

      const nextFlight = await prisma.flight.findUnique({
        where: { id: normalizedNextFlightId },
        select: { id: true },
      });

      if (!nextFlight) {
        return res.status(400).json({
          message: "Next flight not found",
        });
      }
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
        status: normalizedStatus,
        nextFlightId: normalizedNextFlightId,
      },
      include: flightDetailsInclude,
    });

    return res.status(201).json({
      message: "Flight created successfully",
      data: (await includeFlightChains([flight]))[0],
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

    if (req.body?.segments !== undefined) {
      if (!Array.isArray(req.body.segments) || req.body.segments.length < 1) {
        return res.status(400).json({
          message: "At least one flight segment is required",
        });
      }

      const segments: NewFlightData[] = [];

      for (const [index, segment] of req.body.segments.entries()) {
        const normalizedSegment = normalizeFlightInput(segment);

        if (typeof normalizedSegment === "string") {
          return res.status(400).json({
            message: `Invalid segment ${index + 1}: ${normalizedSegment}`,
          });
        }

        segments.push(normalizedSegment);
      }

      for (const [index, segment] of segments.entries()) {
        const [airline, departureAirport, arrivalAirport] = await Promise.all([
          prisma.airline.findUnique({
            where: { id: segment.airlineId },
            select: { id: true },
          }),
          prisma.airport.findUnique({
            where: { id: segment.departureAirportId },
            select: { id: true },
          }),
          prisma.airport.findUnique({
            where: { id: segment.arrivalAirportId },
            select: { id: true },
          }),
        ]);

        if (!airline) {
          return res.status(400).json({
            message: `Airline not found for segment ${index + 1}`,
          });
        }

        if (!departureAirport || !arrivalAirport) {
          return res.status(400).json({
            message: `Airport not found for segment ${index + 1}`,
          });
        }
      }

      const updatedFlight = await prisma.$transaction(async (transaction) => {
        const existingFlightIds = await getFlightChainIds(transaction, id);

        if (existingFlightIds.length === 0) {
          throw new Error("FLIGHT_NOT_FOUND");
        }

        const removedFlightIds = existingFlightIds.slice(segments.length);

        if (removedFlightIds.length > 0) {
          const bookingCount = await transaction.booking.count({
            where: { flightId: { in: removedFlightIds } },
          });

          if (bookingCount > 0) {
            throw new Error("FLIGHT_ITINERARY_HAS_BOOKINGS");
          }
        }

        const flightIds: number[] = [];

        for (const [index, segment] of segments.entries()) {
          const existingSegmentId = existingFlightIds[index];

          const flight = existingSegmentId
            ? await transaction.flight.update({
                where: { id: existingSegmentId },
                data: segment,
                select: { id: true },
              })
            : await transaction.flight.create({
                data: segment,
                select: { id: true },
              });

          flightIds.push(flight.id);
        }

        for (const [index, flightId] of flightIds.entries()) {
          await transaction.flight.update({
            where: { id: flightId },
            data: {
              nextFlightId: flightIds[index + 1] ?? null,
            },
          });
        }

        if (removedFlightIds.length > 0) {
          await transaction.flight.deleteMany({
            where: { id: { in: removedFlightIds } },
          });
        }

        const flight = await transaction.flight.findUnique({
          where: { id },
          include: flightDetailsInclude,
        });

        if (!flight) {
          throw new Error("FLIGHT_NOT_FOUND");
        }

        return flight;
      });

      return res.json({
        message: "Flight itinerary updated successfully",
        data: (await includeFlightChains([updatedFlight]))[0],
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
      status,
      nextFlightId,
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

    if (status !== undefined) {
      const normalizedStatus = normalizeFlightStatus(status);
      if (!normalizedStatus) {
        return res.status(400).json({
          message: "Invalid flight status",
        });
      }
      data.status = normalizedStatus;
    }

    if (nextFlightId !== undefined) {
      if (nextFlightId === null) {
        data.nextFlight = {
          disconnect: true,
        };
      } else {
        const normalizedNextFlightId = Number(nextFlightId);

        if (
          !Number.isInteger(normalizedNextFlightId) ||
          normalizedNextFlightId < 1
        ) {
          return res.status(400).json({
            message: "Invalid next flight ID",
          });
        }

        if (normalizedNextFlightId === id) {
          return res.status(400).json({
            message: "A flight cannot be its own next flight",
          });
        }

        const nextFlight = await prisma.flight.findUnique({
          where: { id: normalizedNextFlightId },
          select: { id: true },
        });

        if (!nextFlight) {
          return res.status(400).json({
            message: "Next flight not found",
          });
        }

        data.nextFlight = {
          connect: {
            id: normalizedNextFlightId,
          },
        };
      }
    }

    const updatedFlight = await prisma.flight.update({
      where: {
        id,
      },
      data,
      include: flightDetailsInclude,
    });

    return res.json({
      message: "Flight updated successfully",
      data: (await includeFlightChains([updatedFlight]))[0],
    });
  } catch (error) {
    console.error("Update flight error:", error);

    if (error instanceof Error && error.message === "FLIGHT_NOT_FOUND") {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    if (
      error instanceof Error &&
      error.message === "FLIGHT_ITINERARY_HAS_BOOKINGS"
    ) {
      return res.status(409).json({
        message: "Cannot remove flight segments that have bookings",
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return res.status(409).json({
        message: "Cannot remove flight segments that have bookings",
      });
    }

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
      select: { id: true },
    });

    if (!flight) {
      return res.status(404).json({
        message: "Flight not found",
      });
    }

    const deletedCount = await prisma.$transaction(async (transaction) => {
      const flightIds = await getFlightChainIds(transaction, id);
      const bookingCount = await transaction.booking.count({
        where: { flightId: { in: flightIds } },
      });

      if (bookingCount > 0) {
        throw new Error("FLIGHT_ITINERARY_HAS_BOOKINGS");
      }

      const result = await transaction.flight.deleteMany({
        where: { id: { in: flightIds } },
      });

      return result.count;
    });

    return res.json({
      message: "Flight itinerary deleted successfully",
      deletedFlights: deletedCount,
    });
  } catch (error) {
    console.error("Delete flight error:", error);

    if (
      error instanceof Error &&
      error.message === "FLIGHT_ITINERARY_HAS_BOOKINGS"
    ) {
      return res.status(409).json({
        message: "Cannot delete a flight itinerary that has bookings",
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return res.status(409).json({
        message: "Cannot delete a flight itinerary that has bookings",
      });
    }

    return res.status(500).json({
      message: "Failed to delete flight",
    });
  }
};