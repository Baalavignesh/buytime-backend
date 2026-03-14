import { getDb } from "../client";
import type { TimeSpending, DeviceType, SpendingSource } from "../../types";

export interface RecordSpendingInput {
  appIdentifier?: string | null;
  appName?: string | null;
  minutesSpent: number;
  startedAt: string;
  endedAt?: string | null;
  deviceType: DeviceType;
  deviceName?: string | null;
  source: SpendingSource;
}

export interface RecordSpendingResult {
  spending: TimeSpending;
  available_minutes: number;
}

// Record time spending: insert row, deduct from balance, update total_spent_minutes in user_stats.
// Returns null if user not found or insufficient balance.
export async function recordSpending(
  clerkUserId: string,
  input: RecordSpendingInput
): Promise<RecordSpendingResult | null> {
  const sql = getDb();
  const result = await sql`
    WITH user_ref AS (
      SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}
    ),
    balance_check AS (
      SELECT available_minutes FROM user_balance
      WHERE user_id = (SELECT id FROM user_ref)
        AND available_minutes >= ${input.minutesSpent}
    ),
    spending_insert AS (
      INSERT INTO time_spending (
        user_id, app_identifier, app_name, minutes_spent,
        started_at, ended_at, device_type, device_name, source
      )
      SELECT
        (SELECT id FROM user_ref),
        ${input.appIdentifier ?? null},
        ${input.appName ?? null},
        ${input.minutesSpent},
        ${input.startedAt}::timestamp,
        ${input.endedAt ?? null}::timestamp,
        ${input.deviceType},
        ${input.deviceName ?? null},
        ${input.source}
      WHERE EXISTS (SELECT 1 FROM balance_check)
      RETURNING *
    ),
    balance_update AS (
      UPDATE user_balance
      SET available_minutes = available_minutes - ${input.minutesSpent}
      WHERE user_id = (SELECT id FROM user_ref)
        AND EXISTS (SELECT 1 FROM spending_insert)
      RETURNING available_minutes
    ),
    stats_update AS (
      UPDATE user_stats
      SET total_spent_minutes = total_spent_minutes + ${input.minutesSpent}
      WHERE user_id = (SELECT id FROM user_ref)
        AND EXISTS (SELECT 1 FROM spending_insert)
    )
    SELECT
      si.*,
      bu.available_minutes AS remaining_balance
    FROM spending_insert si
    CROSS JOIN balance_update bu
  `;

  if (!result[0]) return null;

  const row = result[0] as TimeSpending & { remaining_balance: number };
  return {
    spending: {
      id: row.id,
      user_id: row.user_id,
      app_identifier: row.app_identifier,
      app_name: row.app_name,
      minutes_spent: row.minutes_spent,
      started_at: row.started_at,
      ended_at: row.ended_at,
      device_type: row.device_type,
      device_name: row.device_name,
      source: row.source,
      created_at: row.created_at,
    },
    available_minutes: row.remaining_balance,
  };
}

export interface SpendingHistoryFilters {
  deviceType?: DeviceType;
  source?: SpendingSource;
  startDate?: string;
  endDate?: string;
}

export interface SpendingHistoryResult {
  records: TimeSpending[];
  total: number;
}

export async function getSpendingHistory(
  clerkUserId: string,
  limit: number,
  offset: number,
  filters: SpendingHistoryFilters = {}
): Promise<SpendingHistoryResult> {
  const sql = getDb();

  // Build dynamic filter — we use a single query with optional conditions
  const hasDevice = !!filters.deviceType;
  const hasSource = !!filters.source;
  const hasStart = !!filters.startDate;
  const hasEnd = !!filters.endDate;

  const [records, countResult] = (await Promise.all([
    sql`
      SELECT ts.*
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
        AND (NOT ${hasDevice} OR ts.device_type = ${filters.deviceType ?? ""})
        AND (NOT ${hasSource} OR ts.source = ${filters.source ?? ""})
        AND (NOT ${hasStart} OR ts.started_at >= ${filters.startDate ?? "1970-01-01"}::timestamp)
        AND (NOT ${hasEnd} OR ts.started_at <= ${filters.endDate ?? "2099-12-31"}::timestamp)
      ORDER BY ts.started_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::integer AS total
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
        AND (NOT ${hasDevice} OR ts.device_type = ${filters.deviceType ?? ""})
        AND (NOT ${hasSource} OR ts.source = ${filters.source ?? ""})
        AND (NOT ${hasStart} OR ts.started_at >= ${filters.startDate ?? "1970-01-01"}::timestamp)
        AND (NOT ${hasEnd} OR ts.started_at <= ${filters.endDate ?? "2099-12-31"}::timestamp)
    `,
  ])) as [TimeSpending[], { total: number }[]];

  return {
    records,
    total: (countResult[0] as { total: number })?.total ?? 0,
  };
}

export interface SpendingSummary {
  today_spent_minutes: number;
  total_spent_minutes: number;
  total_records: number;
  by_device: { device_type: string; minutes: number; count: number }[];
  top_apps: { app_identifier: string; app_name: string | null; minutes: number; count: number }[];
}

export async function getSpendingSummary(
  clerkUserId: string
): Promise<SpendingSummary | null> {
  const sql = getDb();

  const [todayResult, totalResult, byDeviceResult, topAppsResult] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(minutes_spent), 0)::integer AS today_spent_minutes
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
        AND DATE(ts.started_at) = CURRENT_DATE
    `,
    sql`
      SELECT
        COALESCE(SUM(minutes_spent), 0)::integer AS total_spent_minutes,
        COUNT(*)::integer AS total_records
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
    `,
    sql`
      SELECT
        ts.device_type,
        COALESCE(SUM(minutes_spent), 0)::integer AS minutes,
        COUNT(*)::integer AS count
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
      GROUP BY ts.device_type
      ORDER BY minutes DESC
    `,
    sql`
      SELECT
        ts.app_identifier,
        ts.app_name,
        COALESCE(SUM(minutes_spent), 0)::integer AS minutes,
        COUNT(*)::integer AS count
      FROM time_spending ts
      JOIN users u ON u.id = ts.user_id
      WHERE u.clerk_user_id = ${clerkUserId}
        AND ts.app_identifier IS NOT NULL
      GROUP BY ts.app_identifier, ts.app_name
      ORDER BY minutes DESC
      LIMIT 10
    `,
  ]);

  if (!todayResult[0]) return null;

  return {
    today_spent_minutes: (todayResult[0] as { today_spent_minutes: number }).today_spent_minutes,
    total_spent_minutes: (totalResult[0] as { total_spent_minutes: number }).total_spent_minutes,
    total_records: (totalResult[0] as { total_records: number }).total_records,
    by_device: byDeviceResult as { device_type: string; minutes: number; count: number }[],
    top_apps: topAppsResult as { app_identifier: string; app_name: string | null; minutes: number; count: number }[],
  };
}
