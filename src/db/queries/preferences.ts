import { getDb } from "../client";
import type { UserPreferences } from "../../types";

export async function getUserPreferences(
  clerkUserId: string
): Promise<UserPreferences | null> {
  const sql = getDb();
  const result = await sql`
    SELECT up.* FROM user_preferences up
    JOIN users u ON u.id = up.user_id
    WHERE u.clerk_user_id = ${clerkUserId}
  `;
  return (result[0] as UserPreferences) || null;
}

export async function updateUserPreferences(
  clerkUserId: string,
  data: { focusDurationMinutes?: number; focusMode?: string }
): Promise<UserPreferences | null> {
  const sql = getDb();

  if (data.focusDurationMinutes !== undefined && data.focusMode !== undefined) {
    const result = await sql`
      UPDATE user_preferences
      SET focus_duration_minutes = ${data.focusDurationMinutes},
          focus_mode = ${data.focusMode}
      FROM users
      WHERE users.id = user_preferences.user_id
        AND users.clerk_user_id = ${clerkUserId}
      RETURNING user_preferences.*
    `;
    return (result[0] as UserPreferences) || null;
  }

  if (data.focusDurationMinutes !== undefined) {
    const result = await sql`
      UPDATE user_preferences
      SET focus_duration_minutes = ${data.focusDurationMinutes}
      FROM users
      WHERE users.id = user_preferences.user_id
        AND users.clerk_user_id = ${clerkUserId}
      RETURNING user_preferences.*
    `;
    return (result[0] as UserPreferences) || null;
  }

  if (data.focusMode !== undefined) {
    const result = await sql`
      UPDATE user_preferences
      SET focus_mode = ${data.focusMode}
      FROM users
      WHERE users.id = user_preferences.user_id
        AND users.clerk_user_id = ${clerkUserId}
      RETURNING user_preferences.*
    `;
    return (result[0] as UserPreferences) || null;
  }

  return getUserPreferences(clerkUserId);
}
