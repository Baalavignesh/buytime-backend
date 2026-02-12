import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    sql = neon(url);
  }
  return sql;
}

export async function checkDbConnection(): Promise<boolean> {
  const db = getDb();
  const result = await db`SELECT 1 as connected`;
  return result[0]?.connected === 1;
}
