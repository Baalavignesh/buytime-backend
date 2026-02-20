import { getDb } from "../client";
import type { UserBalance } from "../../types";

export interface BalanceWithToday {
  available_minutes: number;
  current_streak_days: number;
  last_session_date: Date | null;
  updated_at: Date;
  today_earned_minutes: number;
  today_spent_minutes: number;
  today_sessions_completed: number;
  today_sessions_failed: number;
}

export async function getBalanceWithToday(
  clerkUserId: string
): Promise<BalanceWithToday | null> {
  const sql = getDb();
  const result = await sql`
    WITH user_ref AS (
      SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}
    ),
    today_focus AS (
      SELECT
        COALESCE(SUM(reward_minutes) FILTER (WHERE status = 'completed'), 0)::integer AS earned_minutes,
        COUNT(*) FILTER (WHERE status = 'completed')::integer AS sessions_completed,
        COUNT(*) FILTER (WHERE status = 'failed')::integer AS sessions_failed
      FROM focus_sessions
      WHERE user_id = (SELECT id FROM user_ref)
        AND DATE(started_at) = CURRENT_DATE
    ),
    today_spending AS (
      SELECT COALESCE(SUM(minutes_spent), 0)::integer AS spent_minutes
      FROM time_spending
      WHERE user_id = (SELECT id FROM user_ref)
        AND DATE(started_at) = CURRENT_DATE
    )
    SELECT
      ub.available_minutes,
      ub.current_streak_days,
      ub.last_session_date,
      ub.updated_at,
      tf.earned_minutes AS today_earned_minutes,
      tf.sessions_completed AS today_sessions_completed,
      tf.sessions_failed AS today_sessions_failed,
      ts.spent_minutes AS today_spent_minutes
    FROM user_balance ub
    CROSS JOIN today_focus tf
    CROSS JOIN today_spending ts
    WHERE ub.user_id = (SELECT id FROM user_ref)
  `;
  return (result[0] as BalanceWithToday) || null;
}

export async function updateAvailableMinutes(
  clerkUserId: string,
  availableMinutes: number
): Promise<UserBalance | null> {
  const sql = getDb();
  const result = await sql`
    UPDATE user_balance
    SET available_minutes = ${availableMinutes}
    FROM users
    WHERE users.id = user_balance.user_id
      AND users.clerk_user_id = ${clerkUserId}
    RETURNING user_balance.*
  `;
  return (result[0] as UserBalance) || null;
}
