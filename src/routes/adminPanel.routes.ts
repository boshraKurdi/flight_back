import { NextFunction, Response, Router } from "express";
import {
  createAirline,
  createAirport,
  createSetting,
  deleteAirline,
  deleteAirport,
  deleteSetting,
  getAirlines,
  getPanelAirports,
  getPanelBookingById,
  getPanelBookings,
  getPanelFlightById,
  getPanelFlights,
  getPanelHealth,
  getPanelSettings,
  getPanelStats,
  getPanelUserById,
  getPanelUsers,
  updateAirline,
  updateAirport,
  updatePanelBookingStatus,
  updatePanelUserRole,
  updatePanelUserStatus,
  updateSetting,
} from "../controllers/adminPanel.controller";
import {
  AuthRequest,
  authenticate,
  optionalAuthenticate,
  requireAdmin,
} from "../middlewares/auth.middleware";

const router = Router();
const adminOnly = [authenticate, requireAdmin];

router.get("/health", getPanelHealth);

router.get("/airlines", ...adminOnly, getAirlines);
router.post("/airlines", ...adminOnly, createAirline);
router.put("/airlines/:id", ...adminOnly, updateAirline);
router.delete("/airlines/:id", ...adminOnly, deleteAirline);

router.get("/airports", ...adminOnly, getPanelAirports);
router.post("/airports", ...adminOnly, createAirport);
router.put("/airports/:id", ...adminOnly, updateAirport);
router.delete("/airports/:id", ...adminOnly, deleteAirport);

router.get("/settings", ...adminOnly, getPanelSettings);
router.post("/settings", ...adminOnly, createSetting);
router.put("/settings/:id", ...adminOnly, updateSetting);
router.delete("/settings/:id", ...adminOnly, deleteSetting);

router.get("/flights/search", (_req, _res, next) => next());
router.get("/flights/airports", (_req, _res, next) => next());
router.get(
  "/flights",
  optionalAuthenticate,
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user?.role === "ADMIN" ? getPanelFlights(req, res) : next(),
);
router.get(
  "/flights/:id",
  optionalAuthenticate,
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user?.role === "ADMIN" ? getPanelFlightById(req, res) : next(),
);

router.get(
  "/bookings",
  authenticate,
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user?.role === "ADMIN" ? getPanelBookings(req, res) : next(),
);
router.get(
  "/bookings/:id",
  authenticate,
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user?.role === "ADMIN" ? getPanelBookingById(req, res) : next(),
);
router.patch("/bookings/:id/status", ...adminOnly, updatePanelBookingStatus);

router.get("/users", ...adminOnly, getPanelUsers);
router.get("/users/:id", ...adminOnly, getPanelUserById);
router.patch("/users/:id/role", ...adminOnly, updatePanelUserRole);
router.patch("/users/:id/status", ...adminOnly, updatePanelUserStatus);

router.get("/admin/stats", ...adminOnly, getPanelStats);

export default router;
