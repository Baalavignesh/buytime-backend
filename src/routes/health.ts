import { checkDbConnection } from "../db/client";
import { success, serverError } from "../utils/response";

export async function healthCheck(): Promise<Response> {
  try {
    const dbConnected = await checkDbConnection();

    return success({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: dbConnected ? "connected" : "disconnected",
    });
  } catch (err) {
    console.error("Health check failed:", err);
    return serverError("Database connection failed");
  }
}
