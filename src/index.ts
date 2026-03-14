import { config } from "./config";
import { checkDbConnection } from "./db/client";
import { healthCheck } from "./routes/health";
import { getUser, updateUser, deleteUser } from "./routes/users";
import { getPreferences, updatePreferences } from "./routes/preferences";
import { getBalance, updateBalance } from "./routes/balance";
import {
  startSessionHandler,
  endSessionHandler,
  abandonSessionHandler,
  getCurrentSessionHandler,
  getSessionHistoryHandler,
} from "./routes/sessions";
import {
  recordSpendingHandler,
  getSpendingHistoryHandler,
  getSpendingSummaryHandler,
} from "./routes/spending";
import { handleClerkWebhook } from "./webhooks/clerk";
import { notFound, error } from "./utils/response";

console.log(`Starting BuyTime Backend in ${config.nodeEnv} mode...`);

// Verify required environment variables
const requiredEnvVars = ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
console.log("Environment variables configured");

// Verify database connection on startup
try {
  await checkDbConnection();
  console.log("Database connected successfully");
} catch (err) {
  console.error("Database connection failed:", err);
  process.exit(1);
}

// CORS headers for iOS app
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type RouteHandler = (req: Request) => Promise<Response>;

// Route table: "METHOD /path" -> handler
const routes: Record<string, RouteHandler> = {
  "GET /health": healthCheck,
  "GET /api/users/me": getUser,
  "PATCH /api/users/me": updateUser,
  "DELETE /api/users/me": deleteUser,
  "GET /api/preferences": getPreferences,
  "PATCH /api/preferences": updatePreferences,
  "GET /api/balance": getBalance,
  "PATCH /api/balance": updateBalance,
  "POST /api/sessions/start": startSessionHandler,
  "POST /api/sessions/end": endSessionHandler,
  "POST /api/sessions/abandon": abandonSessionHandler,
  "GET /api/sessions/current": getCurrentSessionHandler,
  "GET /api/sessions/history": getSessionHistoryHandler,
  "POST /api/spending": recordSpendingHandler,
  "GET /api/spending/history": getSpendingHistoryHandler,
  "GET /api/spending/summary": getSpendingSummaryHandler,
  "POST /webhooks/clerk": handleClerkWebhook,
};

const server = Bun.serve({
  port: config.port,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Find matching route
    const handler = routes[`${method} ${path}`];

    let response: Response;

    if (handler) {
      try {
        response = await handler(req);
      } catch (err) {
        console.error(`Error handling ${method} ${path}:`, err);
        response = error("Internal server error", 500);
      }
    } else {
      response = notFound(`Route not found: ${method} ${path}`);
    }

    // Add CORS headers to all responses
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  },

  error(err: Error): Response {
    console.error("Server error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log(`
Available routes:
  GET    /health           - Health check
  GET    /api/users/me     - Get current user (auth required)
  PATCH  /api/users/me     - Update current user (auth required)
  DELETE /api/users/me     - Delete current user (auth required)
  GET    /api/preferences  - Get focus preferences (auth required)
  PATCH  /api/preferences  - Update focus preferences (auth required)
  GET    /api/balance             - Get current balance + today stats (auth required)
  PATCH  /api/balance             - Update available minutes (auth required)
  POST   /api/sessions/start      - Start a focus session (auth required)
  POST   /api/sessions/end        - Complete a session + earn reward (auth required)
  POST   /api/sessions/abandon    - Abandon a session (auth required)
  GET    /api/sessions/current    - Get active session (auth required)
  GET    /api/sessions/history    - Get session history (auth required)
  POST   /api/spending            - Record time spending (auth required)
  GET    /api/spending/history    - Get spending history (auth required)
  GET    /api/spending/summary    - Get spending summary (auth required)
  POST   /webhooks/clerk          - Clerk webhook endpoint
`);
