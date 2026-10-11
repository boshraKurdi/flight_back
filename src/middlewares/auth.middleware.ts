import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

export interface AuthUser {
  userId: number;
  role: "USER" | "ADMIN";
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Authentication required",
    });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({
      message: "Authentication required",
    });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("JWT_SECRET is missing");
    res.status(500).json({
      message: "Server configuration error",
    });
    return;
  }

  let authUser: AuthUser;
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.userId !== "number" ||
      (payload.role !== "USER" && payload.role !== "ADMIN")
    ) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }
    authUser = { userId: payload.userId, role: payload.role };
  } catch {
    res.status(401).json({
      message: "Invalid or expired token",
    });
    return;
  }

  void prisma.user
    .findUnique({
      where: { id: authUser.userId },
      select: { role: true, active: true },
    })
    .then((user) => {
      if (!user || !user.active) {
        res.status(401).json({ message: "Account is disabled or no longer exists" });
        return;
      }
      req.user = { userId: authUser.userId, role: user.role };
      next();
    })
    .catch((error: unknown) => {
      console.error("Authentication lookup error:", error);
      res.status(500).json({ message: "Failed to authenticate request" });
    });
};

export const optionalAuthenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.headers.authorization) {
    next();
    return;
  }
  authenticate(req, res, next);
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  next();
};