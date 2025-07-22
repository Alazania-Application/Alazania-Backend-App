import { activityService } from "@/services";
import { HttpStatusCode } from "axios";
import { Request, Response } from "express";

class ActivityController {
  async getActivities(req: Request, res: Response) {
    const userId = req.user?.id; // Assuming user ID is available in the request object

    const activities = await activityService.getActivities({
      userId,
      ...req.query, // Spread any additional query parameters
    });

    res.status(HttpStatusCode.Ok).json({
      success: true,
      data: activities,
      message: "Activities retrieved successfully",
    });
  }
}

export const activityController = new ActivityController();
