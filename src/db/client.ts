import { neon } from "@neondatabase/serverless";


export const neonDatabaseClient = () => {
    const sql = neon(process.env.DATABASE_URL!);

    return sql;
}