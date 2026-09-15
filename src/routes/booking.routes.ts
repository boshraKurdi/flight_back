import { Router } from "express";
import {
  cancelBooking,
  createBooking,
  getBookingById,
  getMyBookings,
} from "../controllers/booking.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);
router.post("/", createBooking);
router.get("/", getMyBookings);
router.get("/:id", getBookingById);
router.patch("/:id/cancel", cancelBooking);

export default router;
