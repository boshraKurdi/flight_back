import { Router } from "express";

import {
  getFlights,
  getAirports,
  searchFlights,
  getFlightById,
  createFlight,
  updateFlight,
  deleteFlight,
} from "../controllers/flight.controller";

import {
  authenticate,
  requireAdmin,
} from "../middlewares/auth.middleware";

const router = Router();

// Public flight APIs
router.get("/airports", getAirports);
router.get("/", getFlights);
router.get("/search", searchFlights);
router.get("/:id", getFlightById);

// Admin flight APIs
router.post("/", authenticate, requireAdmin, createFlight);
router.put("/:id", authenticate, requireAdmin, updateFlight);
router.delete("/:id", authenticate, requireAdmin, deleteFlight);

export default router;