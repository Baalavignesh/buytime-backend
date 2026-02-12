import { getDb } from "../client";
import type { User, UserBalance, UserStats } from "../../types";


export async function findUserByClerkId(
  clerkUserId: string
): Promise<User | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM users WHERE clerk_user_id = ${clerkUserId}
  `;
  return (result[0] as User) || null;
}

export async function findUserById(id: string): Promise<User | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM users WHERE id = ${id}
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

export async function getUserBalance(
  userId: string
): Promise<UserBalance | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM user_balance WHERE user_id = ${userId}
  `;
  return (result[0] as UserBalance) || null;
}

export async function getUserStats(
  userId: string
): Promise<UserStats | null> {
  const sql = getDb();
  const result = await sql`
    SELECT * FROM user_stats WHERE user_id = ${userId}
  `;
  return (result[0] as UserStats) || null;
}

export async function getUserProfile(clerkUserId: string): Promise<{
  user: User;
  balance: UserBalance;
  stats: UserStats;
} | null> {
  const user = await findUserByClerkId(clerkUserId);
  if (!user) return null;

  const [balance, stats] = await Promise.all([
    getUserBalance(user.id),
    getUserStats(user.id),
  ]);

  if (!balance || !stats) return null;

  return { user, balance, stats };
}
