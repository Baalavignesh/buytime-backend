import { config } from "./config";
import { checkDbConnection } from "./db/client";
import { healthCheck } from "./routes/health";
import { getUser, updateUser, deleteUser } from "./routes/users";
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

    if (handler) {
      try {
        const response = await handler(req);

        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) {
          newHeaders.set(key, value);
        }

        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (err) {
        console.error(`Error handling ${method} ${path}:`, err);
        return error("Internal server error", 500);
      }
    }

    return notFound(`Route not found: ${method} ${path}`);
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
  POST   /webhooks/clerk   - Clerk webhook endpoint
`);
