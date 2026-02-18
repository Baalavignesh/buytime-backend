import { withAuth } from "../middleware/auth";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../db/queries/preferences";
import { success, error, notFound, serverError } from "../utils/response";
import { isValidFocusMode } from "../config";
import type { AuthenticatedRequest } from "../types";

export const getPreferences = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const preferences = await getUserPreferences(auth.userId);

      if (!preferences) {
        return notFound("Preferences not found");
      }

      return success({
        focusDurationMinutes: preferences.focus_duration_minutes,
        focusMode: preferences.focus_mode,
        updatedAt: preferences.updated_at,
      });
    } catch (err) {
      console.error("Error fetching preferences:", err);
      return serverError("Failed to fetch preferences");
    }
  }
);

export const updatePreferences = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { focusDurationMinutes?: number; focusMode?: string };
      try {
        body = (await req.json()) as {
          focusDurationMinutes?: number;
          focusMode?: string;
        };
      } catch {
        return error("Invalid JSON body", 400);
      }

      // Validate at least one field is provided
      if (
        body.focusDurationMinutes === undefined &&
        body.focusMode === undefined
      ) {
        return error(
          "At least one of focusDurationMinutes or focusMode must be provided",
          400
        );
      }

      // Validate focusDurationMinutes
      if (body.focusDurationMinutes !== undefined) {
        if (
          typeof body.focusDurationMinutes !== "number" ||
          !Number.isInteger(body.focusDurationMinutes) ||
          body.focusDurationMinutes < 1 ||
          body.focusDurationMinutes > 240
        ) {
          return error(
            "focusDurationMinutes must be an integer between 1 and 240",
            400
          );
        }
      }

      // Validate focusMode
      if (body.focusMode !== undefined) {
        if (
          typeof body.focusMode !== "string" ||
          !isValidFocusMode(body.focusMode)
        ) {
          return error(
            "focusMode must be one of: fun, easy, medium, hard",
            400
          );
        }
      }

      const preferences = await updateUserPreferences(auth.userId, {
        focusDurationMinutes: body.focusDurationMinutes,
        focusMode: body.focusMode,
      });

      if (!preferences) {
        return notFound("Preferences not found");
      }

      return success({
        focusDurationMinutes: preferences.focus_duration_minutes,
        focusMode: preferences.focus_mode,
        updatedAt: preferences.updated_at,
      });
    } catch (err) {
      console.error("Error updating preferences:", err);
      return serverError("Failed to update preferences");
    }
  }
);
