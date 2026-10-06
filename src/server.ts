import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes";
import flightRoutes from "./routes/flight.routes";
import bookingRoutes from "./routes/booking.routes";
import adminBookingRoutes from "./routes/adminBooking.routes";
import settingsRoutes from "./routes/settings.routes";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:8080", "http://localhost:8081"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/flights", flightRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin/bookings", adminBookingRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Flight Booking API is running 🚀",
  });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log("Server running on port", port);
});