import { Request, Response } from "express";
import prisma from "../lib/prisma";

export const getPublicSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findFirst({
      orderBy: { id: "asc" },
      select: {
        contactPhone: true,
        paymentCode: true,
        paymentQrCode: true,
      },
    });

    return res.json({ data: settings });
  } catch (error) {
    console.error("Get public settings error:", error);

    return res.status(500).json({
      message: "Failed to fetch public settings",
    });
  }
};
