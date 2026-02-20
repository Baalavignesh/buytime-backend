import { withAuth } from "../middleware/auth";
import { getBalanceWithToday, updateAvailableMinutes } from "../db/queries/balance";
import { success, error, notFound, serverError } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

export const getBalance = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const balance = await getBalanceWithToday(auth.userId);

      if (!balance) {
        return notFound("Balance not found");
      }

      return success({
        availableMinutes: balance.available_minutes,
        currentStreakDays: balance.current_streak_days,
        lastSessionDate: balance.last_session_date,
        updatedAt: balance.updated_at,
        today: {
          earnedMinutes: balance.today_earned_minutes,
          spentMinutes: balance.today_spent_minutes,
          sessionsCompleted: balance.today_sessions_completed,
          sessionsFailed: balance.today_sessions_failed,
        },
      });
    } catch (err) {
      console.error("Error fetching balance:", err);
      return serverError("Failed to fetch balance");
    }
  }
);

export const updateBalance = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { availableMinutes?: number };
      try {
        body = (await req.json()) as { availableMinutes?: number };
      } catch {
        return error("Invalid JSON body", 400);
      }

      if (body.availableMinutes === undefined) {
        return error("availableMinutes is required", 400);
      }

      if (
        typeof body.availableMinutes !== "number" ||
        !Number.isInteger(body.availableMinutes) ||
        body.availableMinutes < 0
      ) {
        return error("availableMinutes must be a non-negative integer", 400);
      }

      const balance = await updateAvailableMinutes(auth.userId, body.availableMinutes);

      if (!balance) {
        return notFound("Balance not found");
      }

      return success({
        availableMinutes: balance.available_minutes,
        currentStreakDays: balance.current_streak_days,
        lastSessionDate: balance.last_session_date,
        updatedAt: balance.updated_at,
      });
    } catch (err) {
      console.error("Error updating balance:", err);
      return serverError("Failed to update balance");
    }
  }
);
