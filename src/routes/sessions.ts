import { withAuth } from "../middleware/auth";
import {
  startSession,
  getActiveSession,
  completeSession,
  abandonSession,
  getSessionHistory,
} from "../db/queries/sessions";
import { isValidFocusMode, FOCUS_MODES } from "../config";
import { success, error, notFound, serverError, jsonResponse } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

export const startSessionHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { sessionId?: string; mode?: string; plannedDurationMinutes?: number };
      try {
        body = (await req.json()) as { sessionId?: string; mode?: string; plannedDurationMinutes?: number };
      } catch {
        return error("Invalid JSON body", 400);
      }

      if (!body.mode) {
        return error("mode is required", 400);
      }
      if (!isValidFocusMode(body.mode)) {
        return error("mode must be one of: fun, easy, medium, hard", 400);
      }

      if (body.plannedDurationMinutes !== undefined) {
        if (
          typeof body.plannedDurationMinutes !== "number" ||
          !Number.isInteger(body.plannedDurationMinutes) ||
          body.plannedDurationMinutes < 1 ||
          body.plannedDurationMinutes > 480
        ) {
          return error("plannedDurationMinutes must be an integer between 1 and 480", 400);
        }
      }

      const mode = body.mode;
      const multiplier = FOCUS_MODES[mode].multiplier;
      const plannedDurationMinutes = body.plannedDurationMinutes ?? null;

      const result = await startSession(auth.userId, mode, multiplier, plannedDurationMinutes, body.sessionId);

      if (!result) {
        // Could be user not found or a different active session exists
        const existing = await getActiveSession(auth.userId);
        if (existing) {
          return error("You already have an active session. End or abandon it first.", 409);
        }
        return notFound("User not found");
      }

      const { session, isNew } = result;

      return jsonResponse(
        {
          success: true,
          data: {
            id: session.id,
            mode: session.mode,
            multiplierUsed: session.multiplier_used,
            startedAt: session.started_at,
            plannedDurationMinutes: session.planned_duration_minutes,
            status: session.status,
          },
        },
        isNew ? 201 : 200
      );
    } catch (err) {
      console.error("Error starting session:", err);
      return serverError("Failed to start session");
    }
  }
);

export const endSessionHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { sessionId?: string; actualDurationMinutes?: number };
      try {
        body = (await req.json()) as { sessionId?: string; actualDurationMinutes?: number };
      } catch {
        return error("Invalid JSON body", 400);
      }

      if (!body.sessionId) {
        return error("sessionId is required", 400);
      }
      if (body.actualDurationMinutes === undefined) {
        return error("actualDurationMinutes is required", 400);
      }
      if (
        typeof body.actualDurationMinutes !== "number" ||
        !Number.isInteger(body.actualDurationMinutes) ||
        body.actualDurationMinutes < 1 ||
        body.actualDurationMinutes > 1440
      ) {
        return error("actualDurationMinutes must be an integer between 1 and 1440", 400);
      }

      const result = await completeSession(auth.userId, body.sessionId, body.actualDurationMinutes);

      if (!result) {
        return notFound("Session not found or not owned by you");
      }

      return success({
        session: {
          id: result.id,
          mode: result.mode,
          status: result.status,
          actualDurationMinutes: result.actual_duration_minutes,
          multiplierUsed: result.multiplier_used,
          rewardMinutes: result.reward_minutes,
          startedAt: result.started_at,
          endedAt: result.ended_at,
        },
        balance: {
          availableMinutes: result.available_minutes,
          currentStreakDays: result.current_streak_days,
        },
      });
    } catch (err) {
      console.error("Error ending session:", err);
      return serverError("Failed to end session");
    }
  }
);

export const abandonSessionHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { sessionId?: string; penaltyMinutes?: number };
      try {
        body = (await req.json()) as { sessionId?: string; penaltyMinutes?: number };
      } catch {
        return error("Invalid JSON body", 400);
      }

      if (!body.sessionId) {
        return error("sessionId is required", 400);
      }

      if (body.penaltyMinutes !== undefined) {
        if (
          typeof body.penaltyMinutes !== "number" ||
          body.penaltyMinutes < 0 ||
          body.penaltyMinutes > 1440
        ) {
          return error("penaltyMinutes must be a number between 0 and 1440", 400);
        }
      }

      const session = await abandonSession(auth.userId, body.sessionId, body.penaltyMinutes ?? 0);

      if (!session) {
        return notFound("Session not found or not owned by you");
      }

      return success({
        id: session.id,
        mode: session.mode,
        status: session.status,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        penaltyMinutes: session.penalty_minutes,
        balance: {
          availableMinutes: session.available_minutes,
        },
      });
    } catch (err) {
      console.error("Error abandoning session:", err);
      return serverError("Failed to abandon session");
    }
  }
);

export const getCurrentSessionHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const session = await getActiveSession(auth.userId);

      return success({
        session: session
          ? {
              id: session.id,
              mode: session.mode,
              multiplierUsed: session.multiplier_used,
              startedAt: session.started_at,
              plannedDurationMinutes: session.planned_duration_minutes,
              status: session.status,
            }
          : null,
      });
    } catch (err) {
      console.error("Error fetching current session:", err);
      return serverError("Failed to fetch current session");
    }
  }
);

export const getSessionHistoryHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit") ?? "20";
      const offsetParam = url.searchParams.get("offset") ?? "0";
      const statusParam = url.searchParams.get("status") ?? undefined;

      const limit = parseInt(limitParam, 10);
      const offset = parseInt(offsetParam, 10);

      if (isNaN(limit) || limit < 1 || limit > 100) {
        return error("limit must be an integer between 1 and 100", 400);
      }
      if (isNaN(offset) || offset < 0) {
        return error("offset must be a non-negative integer", 400);
      }
      if (statusParam !== undefined && !["active", "completed", "failed"].includes(statusParam)) {
        return error("status must be one of: active, completed, failed", 400);
      }

      const { sessions, total } = await getSessionHistory(
        auth.userId,
        limit,
        offset,
        statusParam
      );

      return success({
        sessions: sessions.map((s) => ({
          id: s.id,
          mode: s.mode,
          multiplierUsed: s.multiplier_used,
          status: s.status,
          plannedDurationMinutes: s.planned_duration_minutes,
          actualDurationMinutes: s.actual_duration_minutes,
          rewardMinutes: s.reward_minutes,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          createdAt: s.created_at,
        })),
        pagination: {
          total,
          limit,
          offset,
        },
      });
    } catch (err) {
      console.error("Error fetching session history:", err);
      return serverError("Failed to fetch session history");
    }
  }
);
