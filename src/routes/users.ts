import { withAuth } from "../middleware/auth";
import { updateUser as updateUserQuery, deleteUser as deleteUserQuery, getUserProfile } from "../db/queries/users";
import { success, error, notFound, serverError } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

export const getUser = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const profile = await getUserProfile(auth.userId);

      if (!profile) {
        return notFound("User not found");
      }

      return success({
        id: profile.user.id,
        email: profile.user.email,
        displayName: profile.user.display_name,
        subscriptionTier: profile.user.subscription_tier,
        subscriptionStatus: profile.user.subscription_status,
        subscriptionExpiresAt: profile.user.subscription_expires_at,
        createdAt: profile.user.created_at,
        balance: {
          availableMinutes: profile.balance.available_minutes,
          currentStreakDays: profile.balance.current_streak_days,
        },
      });
    } catch (err) {
      console.error("Error fetching user profile:", err);
      return serverError("Failed to fetch user profile");
    }
  }
);

export const updateUser = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: { displayName?: string };
      try {
        body = await req.json() as { displayName?: string };
      } catch {
        return error("Invalid JSON body", 400);
      }

      if (
        body.displayName !== undefined &&
        typeof body.displayName !== "string"
      ) {
        return error("displayName must be a string", 400);
      }

      const user = await updateUserQuery(auth.userId, {
        displayName: body.displayName,
      });

      if (!user) {
        return notFound("User not found");
      }

      return success({
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        updatedAt: user.updated_at,
      });
    } catch (err) {
      console.error("Error updating user:", err);
      return serverError("Failed to update user");
    }
  }
);

export const deleteUser = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const deleted = await deleteUserQuery(auth.userId);

      if (!deleted) {
        return notFound("User not found");
      }

      return success({ deleted: true });
    } catch (err) {
      console.error("Error deleting user:", err);
      return serverError("Failed to delete user");
    }
  }
);
