import { BookingStatus, Prisma, UserRole } from "@prisma/client";
import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { cancelBookingRecord } from "./booking.controller";

const flightInclude = {
  airline: true,
  departureAirport: true,
  arrivalAirport: true,
} satisfies Prisma.FlightInclude;

type FlightRow = Prisma.FlightGetPayload<{ include: typeof flightInclude }>;

const bookingInclude = {
  user: { select: { name: true, email: true } },
  flight: {
    select: {
      flightNumber: true,
      departureAirport: { select: { code: true } },
      arrivalAirport: { select: { code: true } },
    },
  },
} satisfies Prisma.BookingInclude;

const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

const positiveId = (value: unknown, field: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, `Invalid ${field}`);
  return id;
};

const requiredText = (value: unknown, field: string, maxLength = 191) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw httpError(400, `${field} is required`);
  }
  return value.trim();
};

const reportError = (error: unknown, res: Response, message: string) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "This value is already in use" });
    }
    if (error.code === "P2003" || error.code === "P2014") {
      return res.status(409).json({ message: "This record is still used by another record" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Record not found" });
    }
  }

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : 500;
  if (status >= 500 || !Number.isInteger(status)) {
    console.error(message, error);
    return res.status(500).json({ message: "Internal server error" });
  }
  return res.status(status).json({
    message: error instanceof Error ? error.message : "Invalid request",
  });
};

const mapAirline = (airline: {
  id: number;
  name: string;
  code: string;
  logo: string | null;
  createdAt: Date;
  _count: { flights: number };
}) => ({
  id: String(airline.id),
  name: airline.name,
  code: airline.code,
  logoUrl: airline.logo,
  flightCount: airline._count.flights,
  createdAt: airline.createdAt.toISOString(),
});

const airlineInclude = { _count: { select: { flights: true } } } satisfies Prisma.AirlineInclude;

const mapAirport = (airport: {
  id: number;
  name: string;
  city: string;
  country: string;
  code: string;
  timezone: string | null;
  createdAt: Date;
  _count: { departureFlights: number; arrivalFlights: number };
}) => ({
  id: String(airport.id),
  name: airport.name,
  city: airport.city,
  country: airport.country,
  code: airport.code,
  timezone: airport.timezone ?? "",
  flightCount: airport._count.departureFlights + airport._count.arrivalFlights,
  createdAt: airport.createdAt.toISOString(),
});

const airportInclude = {
  _count: { select: { departureFlights: true, arrivalFlights: true } },
} satisfies Prisma.AirportInclude;

export const getPanelHealth = async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", database: "connected" });
  } catch (error) {
    return reportError(error, res, "Health check failed");
  }
};

export const getAirlines = async (_req: Request, res: Response) => {
  try {
    const airlines = await prisma.airline.findMany({
      include: airlineInclude,
      orderBy: { id: "desc" },
    });
    return res.json(airlines.map(mapAirline));
  } catch (error) {
    return reportError(error, res, "Fetch airlines failed");
  }
};

export const createAirline = async (req: Request, res: Response) => {
  try {
    const airline = await prisma.airline.create({
      data: {
        name: requiredText(req.body?.name, "Name"),
        code: requiredText(req.body?.code, "Code", 3).toUpperCase(),
        logo: req.body?.logoUrl ? requiredText(req.body.logoUrl, "Logo URL") : null,
      },
      include: airlineInclude,
    });
    return res.status(201).json(mapAirline(airline));
  } catch (error) {
    return reportError(error, res, "Create airline failed");
  }
};

export const updateAirline = async (req: Request, res: Response) => {
  try {
    const airline = await prisma.airline.update({
      where: { id: positiveId(req.params.id, "airline id") },
      data: {
        name: requiredText(req.body?.name, "Name"),
        code: requiredText(req.body?.code, "Code", 3).toUpperCase(),
        logo: req.body?.logoUrl ? requiredText(req.body.logoUrl, "Logo URL") : null,
      },
      include: airlineInclude,
    });
    return res.json(mapAirline(airline));
  } catch (error) {
    return reportError(error, res, "Update airline failed");
  }
};

export const deleteAirline = async (req: Request, res: Response) => {
  try {
    await prisma.airline.delete({ where: { id: positiveId(req.params.id, "airline id") } });
    return res.status(204).end();
  } catch (error) {
    return reportError(error, res, "Delete airline failed");
  }
};

export const getPanelAirports = async (_req: Request, res: Response) => {
  try {
    const airports = await prisma.airport.findMany({
      include: airportInclude,
      orderBy: { id: "desc" },
    });
    return res.json(airports.map(mapAirport));
  } catch (error) {
    return reportError(error, res, "Fetch airports failed");
  }
};

const readAirportInput = (body: Record<string, unknown> | undefined) => ({
  name: requiredText(body?.name, "Name"),
  city: requiredText(body?.city, "City"),
  country: requiredText(body?.country, "Country"),
  code: requiredText(body?.code, "Code", 3).toUpperCase(),
  timezone: requiredText(body?.timezone, "Timezone"),
});

export const createAirport = async (req: Request, res: Response) => {
  try {
    const airport = await prisma.airport.create({
      data: readAirportInput(req.body),
      include: airportInclude,
    });
    return res.status(201).json(mapAirport(airport));
  } catch (error) {
    return reportError(error, res, "Create airport failed");
  }
};

export const updateAirport = async (req: Request, res: Response) => {
  try {
    const airport = await prisma.airport.update({
      where: { id: positiveId(req.params.id, "airport id") },
      data: readAirportInput(req.body),
      include: airportInclude,
    });
    return res.json(mapAirport(airport));
  } catch (error) {
    return reportError(error, res, "Update airport failed");
  }
};

export const deleteAirport = async (req: Request, res: Response) => {
  try {
    await prisma.airport.delete({ where: { id: positiveId(req.params.id, "airport id") } });
    return res.status(204).end();
  } catch (error) {
    return reportError(error, res, "Delete airport failed");
  }
};

const readSettingInput = (body: Record<string, unknown> | undefined) => {
  const contactPhone = requiredText(body?.contactPhone, "Contact phone", 32);
  const paymentCode = requiredText(body?.paymentCode, "Payment code", 2048);
  const paymentQrCode = body?.paymentQrCode ?? null;
  if (
    paymentQrCode !== null &&
    (typeof paymentQrCode !== "string" ||
      paymentQrCode.length > 5_600_000 ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(paymentQrCode))
  ) {
    throw httpError(400, "QR code must be a PNG, JPEG, or WebP image");
  }
  return { contactPhone, paymentCode, paymentQrCode };
};

const mapSetting = (setting: {
  id: number;
  contactPhone: string;
  paymentCode: string;
  paymentQrCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: String(setting.id),
  contactPhone: setting.contactPhone,
  paymentCode: setting.paymentCode,
  paymentQrCode: setting.paymentQrCode,
  createdAt: setting.createdAt.toISOString(),
  updatedAt: setting.updatedAt.toISOString(),
});

export const getPanelSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany({ orderBy: { id: "desc" } });
    return res.json(settings.map(mapSetting));
  } catch (error) {
    return reportError(error, res, "Fetch settings failed");
  }
};

export const createSetting = async (req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.create({ data: readSettingInput(req.body) });
    return res.status(201).json(mapSetting(setting));
  } catch (error) {
    return reportError(error, res, "Create setting failed");
  }
};

export const updateSetting = async (req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.update({
      where: { id: positiveId(req.params.id, "setting id") },
      data: readSettingInput(req.body),
    });
    return res.json(mapSetting(setting));
  } catch (error) {
    return reportError(error, res, "Update setting failed");
  }
};

export const deleteSetting = async (req: Request, res: Response) => {
  try {
    await prisma.setting.delete({ where: { id: positiveId(req.params.id, "setting id") } });
    return res.status(204).end();
  } catch (error) {
    return reportError(error, res, "Delete setting failed");
  }
};

const mapUser = (user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
}) => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt.toISOString(),
});

const panelUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const getPanelUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: panelUserSelect,
      orderBy: { createdAt: "desc" },
    });
    return res.json(users.map(mapUser));
  } catch (error) {
    return reportError(error, res, "Fetch users failed");
  }
};

export const getPanelUserById = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: positiveId(req.params.id, "user id") },
      select: panelUserSelect,
    });
    if (!user) throw httpError(404, "User not found");
    return res.json(mapUser(user));
  } catch (error) {
    return reportError(error, res, "Fetch user failed");
  }
};

export const updatePanelUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.body?.role;
    if (role !== "USER" && role !== "ADMIN") throw httpError(400, "Invalid user role");
    const id = positiveId(req.params.id, "user id");
    if (id === req.user?.userId && role !== "ADMIN") {
      throw httpError(400, "You cannot remove your own administrator role");
    }
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: panelUserSelect,
    });
    return res.json(mapUser(user));
  } catch (error) {
    return reportError(error, res, "Update user role failed");
  }
};

export const updatePanelUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (typeof req.body?.active !== "boolean") {
      throw httpError(400, "Active must be true or false");
    }
    const id = positiveId(req.params.id, "user id");
    if (id === req.user?.userId && !req.body.active) {
      throw httpError(400, "You cannot disable your own account");
    }
    const user = await prisma.user.update({
      where: { id },
      data: { active: req.body.active },
      select: panelUserSelect,
    });
    return res.json(mapUser(user));
  } catch (error) {
    return reportError(error, res, "Update user status failed");
  }
};

const mapPanelFlight = (flight: FlightRow) => ({
  id: String(flight.id),
  flightNumber: flight.flightNumber,
  airlineId: String(flight.airlineId),
  airlineName: flight.airline.name,
  departureAirportId: String(flight.departureAirportId),
  departureAirportCode: flight.departureAirport.code,
  arrivalAirportId: String(flight.arrivalAirportId),
  arrivalAirportCode: flight.arrivalAirport.code,
  departureTime: flight.departureTime.toISOString(),
  arrivalTime: flight.arrivalTime.toISOString(),
  price: Number(flight.price),
  currency: flight.currency,
  totalSeats: flight.totalSeats,
  availableSeats: flight.availableSeats,
  status: flight.status,
  createdAt: flight.createdAt.toISOString(),
  nextFlightId: flight.nextFlightId === null ? null : String(flight.nextFlightId),
});

type PanelFlight = ReturnType<typeof mapPanelFlight> & { nextFlight: PanelFlight | null };

const buildFlightChains = (flights: FlightRow[], rootsOnly: boolean) => {
  const byId = new Map(flights.map((flight) => [flight.id, flight]));
  const nextIds = new Set(
    flights.flatMap((flight) => (flight.nextFlightId === null ? [] : [flight.nextFlightId])),
  );
  const build = (flight: FlightRow, visited: Set<number>): PanelFlight => {
    const nextVisited = new Set(visited).add(flight.id);
    const nextFlight =
      flight.nextFlightId !== null && !nextVisited.has(flight.nextFlightId)
        ? byId.get(flight.nextFlightId)
        : undefined;
    return {
      ...mapPanelFlight(flight),
      nextFlight: nextFlight ? build(nextFlight, nextVisited) : null,
    };
  };
  return flights
    .filter((flight) => !rootsOnly || !nextIds.has(flight.id))
    .map((flight) => build(flight, new Set()));
};

export const getPanelFlights = async (_req: Request, res: Response) => {
  try {
    const flights = await prisma.flight.findMany({
      include: flightInclude,
      orderBy: { departureTime: "desc" },
    });
    return res.json(buildFlightChains(flights, true));
  } catch (error) {
    return reportError(error, res, "Fetch flights failed");
  }
};

export const getPanelFlightById = async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id, "flight id");
    const flights: FlightRow[] = [];
    const visited = new Set<number>();
    let currentId: number | null = id;
    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      const flight: FlightRow | null = await prisma.flight.findUnique({
        where: { id: currentId },
        include: flightInclude,
      });
      if (!flight) break;
      flights.push(flight);
      currentId = flight.nextFlightId;
    }
    if (flights.length === 0) throw httpError(404, "Flight not found");
    const flightChain = buildFlightChains(flights, false).find(
      (flight) => flight.id === String(id),
    );
    if (!flightChain) throw httpError(404, "Flight not found");
    return res.json(flightChain);
  } catch (error) {
    return reportError(error, res, "Fetch flight failed");
  }
};

const mapPanelBooking = (booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) => ({
  id: String(booking.id),
  reference: booking.bookingReference,
  userName: booking.user.name,
  userEmail: booking.user.email,
  flightNumber: booking.flight.flightNumber,
  route: `${booking.flight.departureAirport.code} → ${booking.flight.arrivalAirport.code}`,
  passengers: booking.totalPassengers,
  totalPrice: Number(booking.totalPrice),
  currency: booking.currency,
  status: booking.status,
  bookingDate: booking.createdAt.toISOString(),
});

export const getPanelBookings = async (_req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: bookingInclude,
      orderBy: { createdAt: "desc" },
    });
    return res.json(bookings.map(mapPanelBooking));
  } catch (error) {
    return reportError(error, res, "Fetch bookings failed");
  }
};

export const getPanelBookingById = async (req: Request, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: positiveId(req.params.id, "booking id") },
      include: bookingInclude,
    });
    if (!booking) throw httpError(404, "Booking not found");
    return res.json(mapPanelBooking(booking));
  } catch (error) {
    return reportError(error, res, "Fetch booking failed");
  }
};

export const updatePanelBookingStatus = async (req: Request, res: Response) => {
  try {
    const id = positiveId(req.params.id, "booking id");
    if (!Object.values(BookingStatus).includes(req.body?.status)) {
      throw httpError(400, "Invalid booking status");
    }
    const status = req.body.status as BookingStatus;
    const existing = await prisma.booking.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw httpError(404, "Booking not found");
    if (existing.status === BookingStatus.CANCELLED && status !== BookingStatus.CANCELLED) {
      throw httpError(400, "Cancelled bookings cannot be reopened automatically");
    }
    if (existing.status === BookingStatus.COMPLETED && status === BookingStatus.CANCELLED) {
      throw httpError(400, "Completed bookings cannot be cancelled");
    }
    if (status === BookingStatus.CANCELLED && existing.status !== BookingStatus.CANCELLED) {
      await cancelBookingRecord(id);
    } else {
      await prisma.booking.update({ where: { id }, data: { status } });
    }
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id },
      include: bookingInclude,
    });
    return res.json(mapPanelBooking(booking));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "BOOKING_ALREADY_CANCELLED") {
        return res.status(400).json({ message: "Booking is already cancelled" });
      }
      if (error.message === "COMPLETED_BOOKING") {
        return res.status(400).json({ message: "Completed bookings cannot be cancelled" });
      }
    }
    return reportError(error, res, "Update booking status failed");
  }
};

export const getPanelStats = async (_req: Request, res: Response) => {
  try {
    const [totalFlights, activeFlights, totalAirlines, totalAirports, totalUsers, totalBookings] =
      await Promise.all([
        prisma.flight.count(),
        prisma.flight.count({ where: { status: { in: ["SCHEDULED", "DELAYED"] } } }),
        prisma.airline.count(),
        prisma.airport.count(),
        prisma.user.count(),
        prisma.booking.count(),
      ]);

    const startDate = new Date();
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    startDate.setMonth(startDate.getMonth() - 5);
    const recentBookings = await prisma.booking.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, totalPrice: true },
    });
    const monthlyTotals = new Map<string, { date: Date; bookings: number; revenue: number }>();
    for (const booking of recentBookings) {
      const date = new Date(booking.createdAt.getFullYear(), booking.createdAt.getMonth(), 1);
      const month = date.toLocaleString("en-US", { month: "short" });
      const current = monthlyTotals.get(month) ?? { date, bookings: 0, revenue: 0 };
      current.bookings += 1;
      current.revenue += Number(booking.totalPrice);
      monthlyTotals.set(month, current);
    }

    return res.json({
      totalFlights,
      activeFlights,
      totalAirlines,
      totalAirports,
      totalUsers,
      totalBookings,
      trends: {
        totalFlights: 0,
        activeFlights: 0,
        totalAirlines: 0,
        totalAirports: 0,
        totalUsers: 0,
        totalBookings: 0,
      },
      bookingsByMonth: [...monthlyTotals.values()]
        .sort((left, right) => left.date.getTime() - right.date.getTime())
        .map(({ date, bookings, revenue }) => ({
          month: date.toLocaleString("en-US", { month: "short" }),
          bookings,
          revenue,
        })),
    });
  } catch (error) {
    return reportError(error, res, "Fetch admin statistics failed");
  }
};
