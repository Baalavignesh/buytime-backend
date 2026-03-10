import { getDb } from "../client";
import type { User, UserBalance } from "../../types";

export async function findUserByClerkId(
  clerkUserId: string
): Promise<User | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
  `;
  return (result[0] as User) || null;
}

/**
 * Create a new user with associated balance and stats rows.
 * Uses a transaction so all 3 inserts succeed or none do.
 */
export async function createUser(data: {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<User> {
  const sql = getDb();

  const result = await sql`
    WITH new_user AS (
      INSERT INTO users (clerk_user_id, email, display_name)
      VALUES (${data.clerkUserId}, ${data.email}, ${data.displayName})
      RETURNING *
    ),
    new_balance AS (
      INSERT INTO user_balance (user_id)
      SELECT id FROM new_user
    ),
    new_stats AS (
      INSERT INTO user_stats (user_id)
      SELECT id FROM new_user
    ),
    new_preferences AS (
      INSERT INTO user_preferences (user_id)
      SELECT id FROM new_user
    )
    SELECT * FROM new_user
  `;

  return result[0] as User;
}

export async function updateUser(
  clerkUserId: string,
  data: { email?: string | null; displayName?: string | null }
): Promise<User | null> {
  const sql = getDb();

  // Build SET clause dynamically based on provided fields
  if (data.email !== undefined && data.displayName !== undefined) {
    const result = await sql`
      UPDATE users
      SET email = ${data.email}, display_name = ${data.displayName}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return (result[0] as User) || null;
  }

  if (data.email !== undefined) {
    const result = await sql`
      UPDATE users SET email = ${data.email}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return (result[0] as User) || null;
  }

  if (data.displayName !== undefined) {
    const result = await sql`
      UPDATE users SET display_name = ${data.displayName}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return (result[0] as User) || null;
  }

  return findUserByClerkId(clerkUserId);
}

export async function deleteUser(clerkUserId: string): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    DELETE FROM users WHERE clerk_user_id = ${clerkUserId} RETURNING id
  `;
  return result.length > 0;
}

export async function getUserProfile(clerkUserId: string): Promise<{
  user: User;
  balance: UserBalance;
} | null> {
  const sql = getDb();
  const result = await sql`
    SELECT
      u.id, u.clerk_user_id, u.email, u.display_name,
      u.subscription_tier, u.subscription_status, u.subscription_expires_at,
      u.created_at, u.updated_at,
      ub.available_minutes, ub.current_streak_days, ub.last_session_date,
      ub.updated_at AS balance_updated_at
    FROM users u
    JOIN user_balance ub ON ub.user_id = u.id
    WHERE u.clerk_user_id = ${clerkUserId}
  `;

  if (!result[0]) return null;

  const row = result[0] as Record<string, unknown>;

  const user: User = {
    id: row.id as string,
    clerk_user_id: row.clerk_user_id as string,
    email: row.email as string | null,
    display_name: row.display_name as string | null,
    subscription_tier: row.subscription_tier as "free" | "premium",
    subscription_status: row.subscription_status as "none" | "active" | "expired" | "cancelled",
    subscription_expires_at: row.subscription_expires_at as Date | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };

  const balance: UserBalance = {
    user_id: row.id as string,
    available_minutes: row.available_minutes as number,
    current_streak_days: row.current_streak_days as number,
    last_session_date: row.last_session_date as Date | null,
    updated_at: row.balance_updated_at as Date,
  };

  return { user, balance };
}
