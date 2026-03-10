import { getDb } from "../client";
import type { FocusSession } from "../../types";
import type { FocusMode } from "../../config";

export interface CompletedSessionResult {
  id: string;
  mode: FocusMode;
  multiplier_used: number;
  status: "completed";
  actual_duration_minutes: number;
  reward_minutes: number;
  started_at: Date;
  ended_at: Date;
  available_minutes: number;
  current_streak_days: number;
}

export interface SessionHistoryResult {
  sessions: FocusSession[];
  total: number;
}

export interface StartSessionResult {
  session: FocusSession;
  isNew: boolean;
}

// Insert a new active session. Accepts an optional client-provided sessionId.
// Returns null if user not found or a *different* active session already exists.
export async function startSession(
  clerkUserId: string,
  mode: FocusMode,
  multiplier: number,
  plannedDurationMinutes: number | null,
  sessionId?: string
): Promise<StartSessionResult | null> {
  const sql = getDb();
  if (sessionId) {
    const result = await sql`
      INSERT INTO focus_sessions (id, user_id, mode, multiplier_used, started_at, planned_duration_minutes, status)
      SELECT ${sessionId}::uuid, u.id, ${mode}, ${multiplier}, NOW(), ${plannedDurationMinutes}, 'active'
      FROM users u
      WHERE u.clerk_user_id = ${clerkUserId}
        AND NOT EXISTS (
          SELECT 1 FROM focus_sessions
          WHERE user_id = u.id AND status = 'active' AND id != ${sessionId}::uuid
        )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `;
    if (result[0]) return { session: result[0] as FocusSession, isNew: true };
    // If no insert, check if the session already exists (idempotent retry)
    const existing = await sql`
      SELECT fs.* FROM focus_sessions fs
      JOIN users u ON u.id = fs.user_id
      WHERE fs.id = ${sessionId}::uuid AND u.clerk_user_id = ${clerkUserId}
    `;
    if (existing[0]) return { session: existing[0] as FocusSession, isNew: false };
    return null;
  }
  const result = await sql`
    INSERT INTO focus_sessions (user_id, mode, multiplier_used, started_at, planned_duration_minutes, status)
    SELECT u.id, ${mode}, ${multiplier}, NOW(), ${plannedDurationMinutes}, 'active'
    FROM users u
    WHERE u.clerk_user_id = ${clerkUserId}
      AND NOT EXISTS (
        SELECT 1 FROM focus_sessions
        WHERE user_id = u.id AND status = 'active'
      )
    RETURNING *
  `;
  if (result[0]) return { session: result[0] as FocusSession, isNew: true };
  return null;
}

export async function getActiveSession(
  clerkUserId: string
): Promise<FocusSession | null> {
  const sql = getDb();
  const result = await sql`
    SELECT fs.*
    FROM focus_sessions fs
    JOIN users u ON u.id = fs.user_id
    WHERE u.clerk_user_id = ${clerkUserId}
      AND fs.status = 'active'
    LIMIT 1
  `;
  return (result[0] as FocusSession) || null;
}

// Complete a session and atomically update balance + lifetime stats in one CTE query.
// Reward is calculated in SQL using the session's stored multiplier_used.
export async function completeSession(
  clerkUserId: string,
  sessionId: string,
  actualDurationMinutes: number
): Promise<CompletedSessionResult | null> {
  const sql = getDb();
  const result = await sql`
    WITH user_ref AS (
      SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}
    ),
    session_update AS (
      UPDATE focus_sessions
      SET
        ended_at = NOW(),
        actual_duration_minutes = ${actualDurationMinutes},
        reward_minutes = ROUND(${actualDurationMinutes} * multiplier_used::numeric / 100)::integer,
        status = 'completed'
      WHERE id = ${sessionId}
        AND user_id = (SELECT id FROM user_ref)
        AND status = 'active'
      RETURNING *
    ),
    today_stats AS (
      -- Snapshot taken before session_update, so counts exclude the session being completed
      SELECT
        COALESCE(SUM(actual_duration_minutes) FILTER (WHERE status = 'completed'), 0)::integer AS focus_minutes,
        COUNT(*) FILTER (WHERE status = 'completed')::integer AS session_count
      FROM focus_sessions
      WHERE user_id = (SELECT id FROM user_ref)
        AND DATE(started_at) = CURRENT_DATE
    ),
    balance_update AS (
      UPDATE user_balance
      SET
        available_minutes = available_minutes + (SELECT reward_minutes FROM session_update),
        current_streak_days = CASE
          WHEN last_session_date = CURRENT_DATE - INTERVAL '1 day' THEN current_streak_days + 1
          WHEN last_session_date = CURRENT_DATE THEN current_streak_days
          ELSE 1
        END,
        last_session_date = CURRENT_DATE
      WHERE user_id = (SELECT id FROM user_ref)
        AND EXISTS (SELECT 1 FROM session_update)
      RETURNING available_minutes, current_streak_days
    ),
    stats_update AS (
      UPDATE user_stats SET
        total_sessions_completed = total_sessions_completed + 1,
        total_focus_minutes      = total_focus_minutes + ${actualDurationMinutes},
        total_earned_minutes     = total_earned_minutes + (SELECT reward_minutes FROM session_update),
        longest_session_minutes  = GREATEST(longest_session_minutes, ${actualDurationMinutes}),
        longest_streak_days      = GREATEST(longest_streak_days, (SELECT current_streak_days FROM balance_update)),
        sessions_fun_mode        = sessions_fun_mode    + CASE WHEN (SELECT mode FROM session_update) = 'fun'    THEN 1 ELSE 0 END,
        sessions_easy_mode       = sessions_easy_mode   + CASE WHEN (SELECT mode FROM session_update) = 'easy'   THEN 1 ELSE 0 END,
        sessions_medium_mode     = sessions_medium_mode + CASE WHEN (SELECT mode FROM session_update) = 'medium' THEN 1 ELSE 0 END,
        sessions_hard_mode       = sessions_hard_mode   + CASE WHEN (SELECT mode FROM session_update) = 'hard'   THEN 1 ELSE 0 END,
        first_session_at         = COALESCE(first_session_at, NOW()),
        best_daily_focus_minutes = GREATEST(best_daily_focus_minutes, (SELECT focus_minutes FROM today_stats) + ${actualDurationMinutes}),
        most_sessions_in_day     = GREATEST(most_sessions_in_day,     (SELECT session_count FROM today_stats) + 1),
        total_days_active        = total_days_active + CASE WHEN (SELECT session_count FROM today_stats) = 0 THEN 1 ELSE 0 END
      WHERE user_id = (SELECT id FROM user_ref)
        AND EXISTS (SELECT 1 FROM session_update)
    )
    SELECT
      su.id,
      su.mode,
      su.multiplier_used,
      su.status,
      su.actual_duration_minutes,
      su.reward_minutes,
      su.started_at,
      su.ended_at,
      bu.available_minutes,
      bu.current_streak_days
    FROM session_update su
    CROSS JOIN balance_update bu
  `;
  if (result[0]) return result[0] as CompletedSessionResult;
  // If no update, check if already completed (idempotent retry)
  const existing = await sql`
    SELECT fs.id, fs.mode, fs.multiplier_used, fs.status,
           fs.actual_duration_minutes, fs.reward_minutes,
           fs.started_at, fs.ended_at,
           ub.available_minutes, ub.current_streak_days
    FROM focus_sessions fs
    JOIN users u ON u.id = fs.user_id
    JOIN user_balance ub ON ub.user_id = u.id
    WHERE fs.id = ${sessionId}
      AND u.clerk_user_id = ${clerkUserId}
      AND fs.status = 'completed'
  `;
  return (existing[0] as CompletedSessionResult) || null;
}

// Mark session as failed and increment total_sessions_failed.
export async function abandonSession(
  clerkUserId: string,
  sessionId: string
): Promise<FocusSession | null> {
  const sql = getDb();
  const result = await sql`
    WITH user_ref AS (
      SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}
    ),
    session_update AS (
      UPDATE focus_sessions
      SET
        ended_at = NOW(),
        status   = 'failed'
      WHERE id = ${sessionId}
        AND user_id = (SELECT id FROM user_ref)
        AND status = 'active'
      RETURNING *
    ),
    stats_update AS (
      UPDATE user_stats
      SET total_sessions_failed = total_sessions_failed + 1
      WHERE user_id = (SELECT id FROM user_ref)
        AND EXISTS (SELECT 1 FROM session_update)
    )
    SELECT * FROM session_update
  `;
  if (result[0]) return result[0] as FocusSession;
  // If no update, check if already failed (idempotent retry)
  const existing = await sql`
    SELECT fs.* FROM focus_sessions fs
    JOIN users u ON u.id = fs.user_id
    WHERE fs.id = ${sessionId}
      AND u.clerk_user_id = ${clerkUserId}
      AND fs.status = 'failed'
  `;
  return (existing[0] as FocusSession) || null;
}

export async function getSessionHistory(
  clerkUserId: string,
  limit: number,
  offset: number,
  status?: string
): Promise<SessionHistoryResult> {
  const sql = getDb();

  let sessions: FocusSession[];
  let countResult: { total: number }[];

  if (status) {
    [sessions, countResult] = (await Promise.all([
      sql`
        SELECT fs.*
        FROM focus_sessions fs
        JOIN users u ON u.id = fs.user_id
        WHERE u.clerk_user_id = ${clerkUserId}
          AND fs.status = ${status}
        ORDER BY fs.started_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::integer AS total
        FROM focus_sessions fs
        JOIN users u ON u.id = fs.user_id
        WHERE u.clerk_user_id = ${clerkUserId}
          AND fs.status = ${status}
      `,
    ])) as [FocusSession[], { total: number }[]];
  } else {
    [sessions, countResult] = (await Promise.all([
      sql`
        SELECT fs.*
        FROM focus_sessions fs
        JOIN users u ON u.id = fs.user_id
        WHERE u.clerk_user_id = ${clerkUserId}
        ORDER BY fs.started_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::integer AS total
        FROM focus_sessions fs
        JOIN users u ON u.id = fs.user_id
        WHERE u.clerk_user_id = ${clerkUserId}
      `,
    ])) as [FocusSession[], { total: number }[]];
  }

  return {
    sessions,
    total: (countResult[0] as { total: number })?.total ?? 0,
  };
}
