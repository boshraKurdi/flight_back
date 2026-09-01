import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // =====================================================
  // PASSWORDS
  // =====================================================

  const adminPassword = await bcrypt.hash("Admin@123456", 10);
  const userPassword = await bcrypt.hash("User@123456", 10);

  // =====================================================
  // USERS
  // =====================================================

  const admin = await prisma.user.upsert({
    where: {
      email: "admin@flightbooking.com",
    },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@flightbooking.com",
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const usersData = [
    {
      name: "Ahmad Ali",
      email: "ahmad@example.com",
    },
    {
      name: "Sara Hassan",
      email: "sara@example.com",
    },
    {
      name: "Omar Khaled",
      email: "omar@example.com",
    },
    {
      name: "Lina Mohammed",
      email: "lina@example.com",
    },
    {
      name: "Yousef Ahmad",
      email: "yousef@example.com",
    },
  ];

  for (const user of usersData) {
    await prisma.user.upsert({
      where: {
        email: user.email,
      },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        password: userPassword,
        role: UserRole.USER,
      },
    });
  }

  console.log("✅ Users created");

  // =====================================================
  // AIRLINES
  // =====================================================

  const airlinesData = [
    {
      name: "Qatar Airways",
      code: "QR",
      logo: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05",
    },
    {
      name: "Emirates",
      code: "EK",
      logo: "https://images.unsplash.com/photo-1542296332-2e4473faf563",
    },
    {
      name: "Turkish Airlines",
      code: "TK",
      logo: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05",
    },
    {
      name: "Etihad Airways",
      code: "EY",
      logo: "https://images.unsplash.com/photo-1529070538774-1843cb3265df",
    },
    {
      name: "SyrianAir",
      code: "RB",
      logo: "https://images.unsplash.com/photo-1556388158-158ea5ccacbd",
    },
    {
      name: "British Airways",
      code: "BA",
      logo: "https://images.unsplash.com/photo-1517479149777-5f3b1511d5ad",
    },
  ];

  const airlines: Record<string, number> = {};

  for (const airline of airlinesData) {
    const createdAirline = await prisma.airline.upsert({
      where: {
        code: airline.code,
      },
      update: {
        name: airline.name,
        logo: airline.logo,
      },
      create: airline,
    });

    airlines[airline.code] = createdAirline.id;
  }

  console.log("✅ Airlines created");

  // =====================================================
  // AIRPORTS
  // =====================================================

  const airportsData = [
    {
      name: "Damascus International Airport",
      city: "Damascus",
      country: "Syria",
      code: "DAM",
      timezone: "Asia/Damascus",
    },
    {
      name: "Beirut–Rafic Hariri International Airport",
      city: "Beirut",
      country: "Lebanon",
      code: "BEY",
      timezone: "Asia/Beirut",
    },
    {
      name: "Hamad International Airport",
      city: "Doha",
      country: "Qatar",
      code: "DOH",
      timezone: "Asia/Qatar",
    },
    {
      name: "Dubai International Airport",
      city: "Dubai",
      country: "United Arab Emirates",
      code: "DXB",
      timezone: "Asia/Dubai",
    },
    {
      name: "Istanbul Airport",
      city: "Istanbul",
      country: "Turkey",
      code: "IST",
      timezone: "Europe/Istanbul",
    },
    {
      name: "Heathrow Airport",
      city: "London",
      country: "United Kingdom",
      code: "LHR",
      timezone: "Europe/London",
    },
    {
      name: "Charles de Gaulle Airport",
      city: "Paris",
      country: "France",
      code: "CDG",
      timezone: "Europe/Paris",
    },
    {
      name: "Frankfurt Airport",
      city: "Frankfurt",
      country: "Germany",
      code: "FRA",
      timezone: "Europe/Berlin",
    },
    {
      name: "King Abdulaziz International Airport",
      city: "Jeddah",
      country: "Saudi Arabia",
      code: "JED",
      timezone: "Asia/Riyadh",
    },
    {
      name: "King Khalid International Airport",
      city: "Riyadh",
      country: "Saudi Arabia",
      code: "RUH",
      timezone: "Asia/Riyadh",
    },
  ];

  const airports: Record<string, number> = {};

  for (const airport of airportsData) {
    const createdAirport = await prisma.airport.upsert({
      where: {
        code: airport.code,
      },
      update: {
        name: airport.name,
        city: airport.city,
        country: airport.country,
        timezone: airport.timezone,
      },
      create: airport,
    });

    airports[airport.code] = createdAirport.id;
  }

  console.log("✅ Airports created");

  // =====================================================
  // FLIGHTS
  // =====================================================

  const flightsData = [
    {
      flightNumber: "QR401",
      airlineCode: "QR",
      from: "BEY",
      to: "DOH",
      departure: "2026-09-10T09:30:00",
      arrival: "2026-09-10T12:15:00",
      price: 320,
      totalSeats: 180,
      availableSeats: 142,
    },
    {
      flightNumber: "QR402",
      airlineCode: "QR",
      from: "DOH",
      to: "BEY",
      departure: "2026-09-15T14:00:00",
      arrival: "2026-09-15T16:45:00",
      price: 315,
      totalSeats: 180,
      availableSeats: 95,
    },
    {
      flightNumber: "EK905",
      airlineCode: "EK",
      from: "DXB",
      to: "LHR",
      departure: "2026-09-11T08:00:00",
      arrival: "2026-09-11T13:00:00",
      price: 680,
      totalSeats: 300,
      availableSeats: 217,
    },
    {
      flightNumber: "EK906",
      airlineCode: "EK",
      from: "LHR",
      to: "DXB",
      departure: "2026-09-18T15:30:00",
      arrival: "2026-09-19T02:00:00",
      price: 720,
      totalSeats: 300,
      availableSeats: 154,
    },
    {
      flightNumber: "TK123",
      airlineCode: "TK",
      from: "IST",
      to: "DAM",
      departure: "2026-09-12T10:00:00",
      arrival: "2026-09-12T11:45:00",
      price: 240,
      totalSeats: 180,
      availableSeats: 76,
    },
    {
      flightNumber: "TK124",
      airlineCode: "TK",
      from: "DAM",
      to: "IST",
      departure: "2026-09-20T13:00:00",
      arrival: "2026-09-20T15:00:00",
      price: 255,
      totalSeats: 180,
      availableSeats: 123,
    },
    {
      flightNumber: "EY301",
      airlineCode: "EY",
      from: "DOH",
      to: "DXB",
      departure: "2026-09-13T11:15:00",
      arrival: "2026-09-13T13:30:00",
      price: 190,
      totalSeats: 200,
      availableSeats: 167,
    },
    {
      flightNumber: "BA150",
      airlineCode: "BA",
      from: "LHR",
      to: "CDG",
      departure: "2026-09-14T07:30:00",
      arrival: "2026-09-14T09:45:00",
      price: 210,
      totalSeats: 180,
      availableSeats: 88,
    },
    {
      flightNumber: "BA151",
      airlineCode: "BA",
      from: "CDG",
      to: "LHR",
      departure: "2026-09-16T18:00:00",
      arrival: "2026-09-16T18:20:00",
      price: 195,
      totalSeats: 180,
      availableSeats: 61,
    },
    {
      flightNumber: "RB201",
      airlineCode: "RB",
      from: "DAM",
      to: "BEY",
      departure: "2026-09-17T09:00:00",
      arrival: "2026-09-17T10:00:00",
      price: 120,
      totalSeats: 150,
      availableSeats: 97,
    },
    {
      flightNumber: "RB202",
      airlineCode: "RB",
      from: "BEY",
      to: "DAM",
      departure: "2026-09-19T16:00:00",
      arrival: "2026-09-19T17:00:00",
      price: 125,
      totalSeats: 150,
      availableSeats: 113,
    },
    {
      flightNumber: "QR701",
      airlineCode: "QR",
      from: "DOH",
      to: "LHR",
      departure: "2026-09-21T01:30:00",
      arrival: "2026-09-21T07:00:00",
      price: 590,
      totalSeats: 250,
      availableSeats: 184,
    },
    {
      flightNumber: "EK302",
      airlineCode: "EK",
      from: "DXB",
      to: "FRA",
      departure: "2026-09-22T09:45:00",
      arrival: "2026-09-22T14:20:00",
      price: 510,
      totalSeats: 280,
      availableSeats: 201,
    },
    {
      flightNumber: "TK450",
      airlineCode: "TK",
      from: "IST",
      to: "FRA",
      departure: "2026-09-23T12:30:00",
      arrival: "2026-09-23T14:15:00",
      price: 280,
      totalSeats: 180,
      availableSeats: 134,
    },
    {
      flightNumber: "EY502",
      airlineCode: "EY",
      from: "JED",
      to: "DOH",
      departure: "2026-09-24T18:00:00",
      arrival: "2026-09-24T20:30:00",
      price: 230,
      totalSeats: 200,
      availableSeats: 145,
    },
  ];

  for (const flight of flightsData) {
    await prisma.flight.upsert({
      where: {
        id: await getExistingFlightId(flight.flightNumber),
      },
      update: {
        airlineId: airlines[flight.airlineCode],
        departureAirportId: airports[flight.from],
        arrivalAirportId: airports[flight.to],
        departureTime: new Date(flight.departure),
        arrivalTime: new Date(flight.arrival),
        price: flight.price,
        currency: "USD",
        totalSeats: flight.totalSeats,
        availableSeats: flight.availableSeats,
      },
      create: {
        flightNumber: flight.flightNumber,
        airlineId: airlines[flight.airlineCode],
        departureAirportId: airports[flight.from],
        arrivalAirportId: airports[flight.to],
        departureTime: new Date(flight.departure),
        arrivalTime: new Date(flight.arrival),
        price: flight.price,
        currency: "USD",
        totalSeats: flight.totalSeats,
        availableSeats: flight.availableSeats,
      },
    });
  }

  console.log("✅ Flights created");

  console.log("");
  console.log("🎉 Database seed completed successfully!");
  console.log("");
  console.log("Admin login:");
  console.log("Email: admin@flightbooking.com");
  console.log("Password: Admin@123456");
  console.log("");
  console.log("Test user:");
  console.log("Email: ahmad@example.com");
  console.log("Password: User@123456");
  console.log("");
}

// =====================================================
// HELPER
// =====================================================

async function getExistingFlightId(flightNumber: string): Promise<number> {
  const flight = await prisma.flight.findFirst({
    where: {
      flightNumber,
    },
    select: {
      id: true,
    },
  });

  return flight?.id ?? -1;
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });