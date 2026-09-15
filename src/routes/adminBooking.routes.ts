import { Router } from "express";
import {
  getAdminBookingById,
  getAdminBookings,
  updateAdminBookingStatus,
} from "../controllers/adminBooking.controller";
import { authenticate, requireAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate, requireAdmin);
router.get("/", getAdminBookings);
router.get("/:id", getAdminBookingById);
router.patch("/:id/status", updateAdminBookingStatus);

export default router;
