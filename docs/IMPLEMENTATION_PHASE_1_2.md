# BuyTime Backend - Phase 1 & 2 Implementation Guide

> Complete implementation guide with all code for Foundation and Authentication phases.

---

## Table of Contents

1. [Phase 1: Foundation](#phase-1-foundation)
   - [1.1 Neon Database Setup](#11-neon-database-setup)
   - [1.2 Environment Configuration](#12-environment-configuration)
   - [1.3 Project Structure Setup](#13-project-structure-setup)
   - [1.4 Database Client](#14-database-client)
   - [1.5 Configuration & Constants](#15-configuration--constants)
   - [1.6 TypeScript Types](#16-typescript-types)
   - [1.7 Basic HTTP Server](#17-basic-http-server)
   - [1.8 Database Health Check](#18-database-health-check)

2. [Phase 2: Authentication](#phase-2-authentication)
   - [2.1 Install Dependencies](#21-install-dependencies)
   - [2.2 Auth Middleware](#22-auth-middleware)
   - [2.3 User Database Queries](#23-user-database-queries)
   - [2.4 Clerk Webhook Handler](#24-clerk-webhook-handler)
   - [2.5 User API Routes](#25-user-api-routes)
   - [2.6 Updated Server with Routes](#26-updated-server-with-routes)
   - [2.7 Testing](#27-testing)

3. [Final Project Structure](#final-project-structure)
4. [Testing Checklist](#testing-checklist)

---

## Phase 1: Foundation

### 1.1 Neon Database Setup

#### Step 1: Create Neon Account & Project

1. Go to [console.neon.tech](https://console.neon.tech)
2. Sign up or log in
3. Click "Create Project"
4. Name: `buytime`
5. Region: Choose closest to your users (e.g., `us-east-1`)
6. Click "Create Project"

#### Step 2: Get Connection String

1. In your project dashboard, find "Connection Details"
2. Copy the connection string (looks like):
   ```
   postgresql://neondb_owner:password@ep-xxx-xxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

#### Step 3: Run Schema SQL

Go to the "SQL Editor" in Neon Console and run the complete schema:

```sql
-- ============================================
-- USERS TABLE
-- Synced from Clerk via webhooks
-- Subscription updated via RevenueCat webhooks
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT UNIQUE NOT NULL,
    email TEXT,
    display_name TEXT,

    -- Subscription info (updated via RevenueCat/App Store webhooks)
    subscription_tier TEXT DEFAULT 'free',      -- 'free', 'premium'
    subscription_status TEXT DEFAULT 'none',    -- 'none', 'active', 'expired', 'cancelled'
    subscription_expires_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);

-- ============================================
-- FOCUS SESSIONS TABLE
-- Records of each focus session
-- ============================================
CREATE TABLE focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Mode info (validated against constants, not FK)
    mode TEXT NOT NULL,                   -- 'fun', 'easy', 'medium', 'hard'
    multiplier_used INTEGER NOT NULL,     -- Snapshot of multiplier at session start

    -- Session timing
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    planned_duration_minutes INTEGER,     -- NULL if open-ended
    actual_duration_minutes INTEGER,      -- Calculated when session ends

    -- Reward calculation
    reward_minutes INTEGER,               -- Calculated: actual_duration × multiplier / 100

    -- Session status
    status TEXT DEFAULT 'active',         -- 'active', 'completed', 'failed'

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON focus_sessions(user_id);
CREATE INDEX idx_sessions_status ON focus_sessions(status);
CREATE INDEX idx_sessions_started ON focus_sessions(started_at);
CREATE INDEX idx_sessions_user_date ON focus_sessions(user_id, started_at);

-- Validate mode values
ALTER TABLE focus_sessions
ADD CONSTRAINT valid_mode CHECK (mode IN ('fun', 'easy', 'medium', 'hard'));

-- ============================================
-- USER BALANCE TABLE
-- Current state - frequently read/written
-- One row per user (user_id is PK)
-- ============================================
CREATE TABLE user_balance (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Current spendable balance
    available_minutes INTEGER DEFAULT 0,

    -- Streak tracking
    current_streak_days INTEGER DEFAULT 0,
    last_session_date DATE,               -- For streak calculation

    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- USER STATS TABLE
-- Lifetime statistics - updated on events
-- One row per user (user_id is PK)
-- ============================================
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Session counts
    total_sessions_completed INTEGER DEFAULT 0,
    total_sessions_failed INTEGER DEFAULT 0,

    -- Time totals (in minutes)
    total_focus_minutes INTEGER DEFAULT 0,
    total_earned_minutes INTEGER DEFAULT 0,
    total_spent_minutes INTEGER DEFAULT 0,

    -- Streaks
    longest_streak_days INTEGER DEFAULT 0,

    -- Personal bests / Records
    longest_session_minutes INTEGER DEFAULT 0,
    best_daily_focus_minutes INTEGER DEFAULT 0,
    most_sessions_in_day INTEGER DEFAULT 0,

    -- Mode usage counts
    sessions_fun_mode INTEGER DEFAULT 0,
    sessions_easy_mode INTEGER DEFAULT 0,
    sessions_medium_mode INTEGER DEFAULT 0,
    sessions_hard_mode INTEGER DEFAULT 0,

    -- App spending stats
    unique_apps_unlocked INTEGER DEFAULT 0,
    most_used_app_bundle_id TEXT,
    most_used_app_minutes INTEGER DEFAULT 0,

    -- Milestones
    first_session_at TIMESTAMP,
    total_days_active INTEGER DEFAULT 0,  -- Days with ≥1 completed session

    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TIME SPENDING TABLE
-- Log of reward time spent on apps
-- ============================================
CREATE TABLE time_spending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- What app was used
    app_bundle_id TEXT NOT NULL,          -- e.g., 'com.instagram.ios'
    app_name TEXT,                        -- Human readable name

    -- Time spent
    minutes_spent INTEGER NOT NULL,

    -- When it happened
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_spending_user ON time_spending(user_id);
CREATE INDEX idx_spending_app ON time_spending(app_bundle_id);
CREATE INDEX idx_spending_date ON time_spending(started_at);

-- ============================================
-- HELPER FUNCTION: Update timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_balance_timestamp
    BEFORE UPDATE ON user_balance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_stats_timestamp
    BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- USER PREFERENCES TABLE
-- Default focus settings, one row per user
-- ============================================
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    focus_duration_minutes INTEGER DEFAULT 25,
    focus_mode TEXT DEFAULT 'easy',
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE user_preferences
ADD CONSTRAINT valid_focus_mode CHECK (focus_mode IN ('fun', 'easy', 'medium', 'hard'));

CREATE TRIGGER update_preferences_timestamp
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### 1.2 Environment Configuration

#### Create `.env` file (never commit):

```bash
# Database - Neon PostgreSQL
DATABASE_URL=postgresql://neondb_owner:your_password@ep-xxx-xxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require

# Clerk Authentication
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret_here

# Server
PORT=3000
NODE_ENV=development
```

#### Update `.env.example` (commit this):

```bash
# Database - Neon PostgreSQL
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_xxx
CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Server
PORT=3000
NODE_ENV=development
```

---

### 1.3 Project Structure Setup

Create the following directory structure:

```
src/
├── config/
│   └── index.ts           # Constants and configuration
├── db/
│   ├── client.ts          # Database connection
│   └── queries/
│       ├── users.ts       # User queries
│       ├── balance.ts     # Balance queries
│       └── stats.ts       # Stats queries
├── middleware/
│   └── auth.ts            # Clerk JWT verification
├── routes/
│   ├── users.ts           # /api/users/* handlers
│   └── health.ts          # Health check endpoint
├── webhooks/
│   └── clerk.ts           # Clerk webhook handler
├── types/
│   └── index.ts           # TypeScript interfaces
├── utils/
│   └── response.ts        # HTTP response helpers
└── index.ts               # Entry point
```

---

### 1.4 Database Client

#### `src/db/client.ts`

```typescript
import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Singleton database client
let sql: NeonQueryFunction<false, false> | null = null;

/**
 * Get the database client instance.
 * Creates a new connection if one doesn't exist.
 */
export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    sql = neon(connectionString);
  }

  return sql;
}

/**
 * Execute a health check query to verify database connectivity.
 * Returns true if connection is successful, throws on failure.
 */
export async function checkDbConnection(): Promise<boolean> {
  const db = getDb();
  const result = await db`SELECT 1 as connected`;
  return result[0]?.connected === 1;
}

/**
 * Reset the database client (useful for testing).
 */
export function resetDbClient(): void {
  sql = null;
}
```

---

### 1.5 Configuration & Constants

#### `src/config/index.ts`

```typescript
/**
 * Focus modes with their reward multipliers.
 * These are constants - not stored in the database.
 */
export const FOCUS_MODES = {
  fun: {
    multiplier: 150,
    displayName: "Fun",
    description: "Lenient - 1hr focus = 1.5hr reward",
  },
  easy: {
    multiplier: 100,
    displayName: "Easy",
    description: "Balanced - 1hr focus = 1hr reward",
  },
  medium: {
    multiplier: 50,
    displayName: "Medium",
    description: "Challenging - 1hr focus = 30min reward",
  },
  hard: {
    multiplier: 25,
    displayName: "Hard",
    description: "Hardcore - 1hr focus = 15min reward",
  },
} as const;

export type FocusMode = keyof typeof FOCUS_MODES;

/**
 * Validate that a string is a valid focus mode.
 */
export function isValidFocusMode(mode: string): mode is FocusMode {
  return mode in FOCUS_MODES;
}

/**
 * Get the multiplier for a focus mode.
 */
export function getMultiplier(mode: FocusMode): number {
  return FOCUS_MODES[mode].multiplier;
}

/**
 * Calculate reward minutes based on focus duration and mode.
 */
export function calculateReward(durationMinutes: number, mode: FocusMode): number {
  const multiplier = getMultiplier(mode);
  return Math.round(durationMinutes * (multiplier / 100));
}

/**
 * Server configuration from environment variables.
 */
export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDevelopment: process.env.NODE_ENV !== "production",

  // Clerk
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || "",
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET || "",
} as const;
```

---

### 1.6 TypeScript Types

#### `src/types/index.ts`

```typescript
import type { FocusMode } from "../config";

// ============================================
// Database Row Types
// ============================================

export interface User {
  id: string;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: "free" | "premium";
  subscription_status: "none" | "active" | "expired" | "cancelled";
  subscription_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface FocusSession {
  id: string;
  user_id: string;
  mode: FocusMode;
  multiplier_used: number;
  started_at: Date;
  ended_at: Date | null;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  reward_minutes: number | null;
  status: "active" | "completed" | "failed";
  created_at: Date;
}

export interface UserBalance {
  user_id: string;
  available_minutes: number;
  current_streak_days: number;
  last_session_date: Date | null;
  updated_at: Date;
}

export interface UserStats {
  user_id: string;
  total_sessions_completed: number;
  total_sessions_failed: number;
  total_focus_minutes: number;
  total_earned_minutes: number;
  total_spent_minutes: number;
  longest_streak_days: number;
  longest_session_minutes: number;
  best_daily_focus_minutes: number;
  most_sessions_in_day: number;
  sessions_fun_mode: number;
  sessions_easy_mode: number;
  sessions_medium_mode: number;
  sessions_hard_mode: number;
  unique_apps_unlocked: number;
  most_used_app_bundle_id: string | null;
  most_used_app_minutes: number;
  first_session_at: Date | null;
  total_days_active: number;
  updated_at: Date;
}

export interface TimeSpending {
  id: string;
  user_id: string;
  app_bundle_id: string;
  app_name: string | null;
  minutes_spent: number;
  started_at: Date;
  ended_at: Date | null;
  created_at: Date;
}

export interface UserPreferences {
  user_id: string;
  focus_duration_minutes: number;
  focus_mode: FocusMode;
  updated_at: Date;
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthenticatedRequest {
  userId: string; // Clerk user ID
  user?: User;    // Database user (populated by middleware if needed)
}

// ============================================
// Clerk Webhook Types
// ============================================

export interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
}

export interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  first_name: string | null;
  last_name: string | null;
  created_at: number;
  updated_at: number;
}
```

---

### 1.7 Basic HTTP Server

#### `src/utils/response.ts`

```typescript
import type { ApiResponse } from "../types";

/**
 * Create a JSON response with proper headers.
 */
export function jsonResponse<T>(
  data: T,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a success response.
 */
export function success<T>(data: T): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  return jsonResponse(response, 200);
}

/**
 * Create an error response.
 */
export function error(message: string, status: number = 400): Response {
  const response: ApiResponse = {
    success: false,
    error: message,
  };
  return jsonResponse(response, status);
}

/**
 * Create a 404 Not Found response.
 */
export function notFound(message: string = "Not found"): Response {
  return error(message, 404);
}

/**
 * Create a 401 Unauthorized response.
 */
export function unauthorized(message: string = "Unauthorized"): Response {
  return error(message, 401);
}

/**
 * Create a 500 Internal Server Error response.
 */
export function serverError(message: string = "Internal server error"): Response {
  return error(message, 500);
}
```

#### `src/routes/health.ts`

```typescript
import { checkDbConnection } from "../db/client";
import { success, serverError } from "../utils/response";

/**
 * Health check endpoint handler.
 * GET /health
 */
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
```

---

### 1.8 Database Health Check

#### Updated `src/index.ts` (Phase 1 version)

```typescript
import { config } from "./config";
import { checkDbConnection } from "./db/client";
import { healthCheck } from "./routes/health";
import { notFound } from "./utils/response";

console.log(`Starting BuyTime Backend in ${config.nodeEnv} mode...`);

// Verify database connection on startup
try {
  await checkDbConnection();
  console.log("✓ Database connected successfully");
} catch (err) {
  console.error("✗ Database connection failed:", err);
  process.exit(1);
}

// Start HTTP server
const server = Bun.serve({
  port: config.port,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Health check (no auth required)
    if (path === "/health" && method === "GET") {
      return healthCheck();
    }

    // 404 for unknown routes
    return notFound(`Route not found: ${method} ${path}`);
  },

  error(err: Error): Response {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`✓ Server running at http://localhost:${server.port}`);
```

---

## Phase 2: Authentication

### 2.1 Install Dependencies

Run the following command to install Clerk backend SDK and svix (for webhook verification):

```bash
bun add @clerk/backend svix
```

Your `package.json` should now include:

```json
{
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2",
    "@clerk/backend": "^1.x.x",
    "svix": "^1.x.x"
  }
}
```

---

### 2.2 Auth Middleware

#### `src/middleware/auth.ts`

```typescript
import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config";
import { unauthorized, serverError } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

// Create Clerk client
const clerk = createClerkClient({
  secretKey: config.clerkSecretKey,
});

/**
 * Extract and verify the Clerk JWT token from the Authorization header.
 * Returns the Clerk user ID if valid, null otherwise.
 */
export async function verifyAuthToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
    });

    return payload.sub; // Clerk user ID
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}

/**
 * Authentication middleware.
 * Wraps a route handler to require valid Clerk authentication.
 * Injects userId into the handler context.
 */
export function withAuth(
  handler: (req: Request, auth: AuthenticatedRequest) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const userId = await verifyAuthToken(req);

    if (!userId) {
      return unauthorized("Invalid or missing authentication token");
    }

    return handler(req, { userId });
  };
}

/**
 * Get the Clerk client for making API calls.
 */
export function getClerkClient() {
  return clerk;
}
```

---

### 2.3 User Database Queries

#### `src/db/queries/users.ts`

```typescript
import { getDb } from "../client";
import type { User, UserBalance, UserStats } from "../../types";

/**
 * Find a user by their Clerk user ID.
 */
export async function findUserByClerkId(clerkUserId: string): Promise<User | null> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM users
    WHERE clerk_user_id = ${clerkUserId}
  `;

  return result[0] as User | null;
}

/**
 * Find a user by their internal UUID.
 */
export async function findUserById(id: string): Promise<User | null> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM users
    WHERE id = ${id}
  `;

  return result[0] as User | null;
}

/**
 * Create a new user from Clerk webhook data.
 * Also creates associated user_balance, user_stats, and user_preferences records.
 */
export async function createUser(data: {
  clerkUserId: string;
  email: string | null;
  displayName: string | null;
}): Promise<User> {
  const sql = getDb();

  // Insert user
  const userResult = await sql`
    INSERT INTO users (clerk_user_id, email, display_name)
    VALUES (${data.clerkUserId}, ${data.email}, ${data.displayName})
    RETURNING *
  `;

  const user = userResult[0] as User;

  // Create user_balance record
  await sql`
    INSERT INTO user_balance (user_id)
    VALUES (${user.id})
  `;

  // Create user_stats record
  await sql`
    INSERT INTO user_stats (user_id)
    VALUES (${user.id})
  `;

  // Create user_preferences record
  await sql`
    INSERT INTO user_preferences (user_id)
    VALUES (${user.id})
  `;

  return user;
}

/**
 * Update a user's profile information.
 */
export async function updateUser(
  clerkUserId: string,
  data: {
    email?: string | null;
    displayName?: string | null;
  }
): Promise<User | null> {
  const sql = getDb();

  // Build dynamic update
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (data.email !== undefined) {
    values.push(data.email);
  }

  if (data.displayName !== undefined) {
    values.push(data.displayName);
  }

  // Handle each field separately for type safety
  if (data.email !== undefined && data.displayName !== undefined) {
    const result = await sql`
      UPDATE users
      SET email = ${data.email}, display_name = ${data.displayName}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return result[0] as User | null;
  } else if (data.email !== undefined) {
    const result = await sql`
      UPDATE users
      SET email = ${data.email}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return result[0] as User | null;
  } else if (data.displayName !== undefined) {
    const result = await sql`
      UPDATE users
      SET display_name = ${data.displayName}
      WHERE clerk_user_id = ${clerkUserId}
      RETURNING *
    `;
    return result[0] as User | null;
  }

  // No updates, just return current user
  return findUserByClerkId(clerkUserId);
}

/**
 * Delete a user and all their associated data.
 * CASCADE will handle user_balance, user_stats, user_preferences, focus_sessions, time_spending.
 */
export async function deleteUser(clerkUserId: string): Promise<boolean> {
  const sql = getDb();

  const result = await sql`
    DELETE FROM users
    WHERE clerk_user_id = ${clerkUserId}
    RETURNING id
  `;

  return result.length > 0;
}

/**
 * Get user's balance record.
 */
export async function getUserBalance(userId: string): Promise<UserBalance | null> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM user_balance
    WHERE user_id = ${userId}
  `;

  return result[0] as UserBalance | null;
}

/**
 * Get user's stats record.
 */
export async function getUserStats(userId: string): Promise<UserStats | null> {
  const sql = getDb();

  const result = await sql`
    SELECT * FROM user_stats
    WHERE user_id = ${userId}
  `;

  return result[0] as UserStats | null;
}

/**
 * Get user profile with balance and stats.
 */
export async function getUserProfile(clerkUserId: string): Promise<{
  user: User;
  balance: UserBalance;
  stats: UserStats;
} | null> {
  const user = await findUserByClerkId(clerkUserId);

  if (!user) {
    return null;
  }

  const [balance, stats] = await Promise.all([
    getUserBalance(user.id),
    getUserStats(user.id),
  ]);

  if (!balance || !stats) {
    return null;
  }

  return { user, balance, stats };
}
```

---

### 2.4 Clerk Webhook Handler

#### `src/webhooks/clerk.ts`

```typescript
import { Webhook } from "svix";
import { config } from "../config";
import { createUser, updateUser, deleteUser, findUserByClerkId } from "../db/queries/users";
import { success, error, serverError } from "../utils/response";
import type { ClerkWebhookEvent, ClerkUserData } from "../types";

/**
 * Handle Clerk webhook events.
 * POST /webhooks/clerk
 */
export async function handleClerkWebhook(req: Request): Promise<Response> {
  // Get the raw body and headers for verification
  const body = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return error("Missing svix headers", 400);
  }

  // Verify the webhook signature
  const wh = new Webhook(config.clerkWebhookSecret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return error("Invalid webhook signature", 401);
  }

  // Handle the event
  try {
    switch (event.type) {
      case "user.created":
        await handleUserCreated(event.data);
        break;

      case "user.updated":
        await handleUserUpdated(event.data);
        break;

      case "user.deleted":
        await handleUserDeleted(event.data);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return success({ received: true });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return serverError("Failed to process webhook");
  }
}

/**
 * Handle user.created event from Clerk.
 */
async function handleUserCreated(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.created for Clerk user: ${data.id}`);

  // Check if user already exists (idempotency)
  const existingUser = await findUserByClerkId(data.id);
  if (existingUser) {
    console.log(`User already exists: ${data.id}`);
    return;
  }

  // Extract primary email
  const primaryEmail = data.email_addresses?.[0]?.email_address || null;

  // Build display name from first/last name
  const displayName = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ") || null;

  const user = await createUser({
    clerkUserId: data.id,
    email: primaryEmail,
    displayName,
  });

  console.log(`Created user: ${user.id} (Clerk: ${data.id})`);
}

/**
 * Handle user.updated event from Clerk.
 */
async function handleUserUpdated(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.updated for Clerk user: ${data.id}`);

  // Extract primary email
  const primaryEmail = data.email_addresses?.[0]?.email_address || null;

  // Build display name from first/last name
  const displayName = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ") || null;

  const user = await updateUser(data.id, {
    email: primaryEmail,
    displayName,
  });

  if (user) {
    console.log(`Updated user: ${user.id} (Clerk: ${data.id})`);
  } else {
    // User doesn't exist yet - create them
    console.log(`User not found, creating: ${data.id}`);
    await handleUserCreated(data);
  }
}

/**
 * Handle user.deleted event from Clerk.
 */
async function handleUserDeleted(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.deleted for Clerk user: ${data.id}`);

  const deleted = await deleteUser(data.id);

  if (deleted) {
    console.log(`Deleted user (Clerk: ${data.id})`);
  } else {
    console.log(`User not found for deletion: ${data.id}`);
  }
}
```

---

### 2.5 User API Routes

#### `src/routes/users.ts`

```typescript
import { withAuth } from "../middleware/auth";
import { findUserByClerkId, updateUser, deleteUser, getUserProfile } from "../db/queries/users";
import { success, error, notFound, serverError } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

/**
 * Get current user profile.
 * GET /api/users/me
 */
export const getMe = withAuth(async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
  try {
    const profile = await getUserProfile(auth.userId);

    if (!profile) {
      return notFound("User not found");
    }

    // Format response
    return success({
      id: profile.user.id,
      email: profile.user.email,
      displayName: profile.user.display_name,
      subscriptionTier: profile.user.subscription_tier,
      subscriptionStatus: profile.user.subscription_status,
      subscriptionExpiresAt: profile.user.subscription_expires_at,
      createdAt: profile.user.created_at,
      balance: {
        availableMinutes: profile.balance.available_minutes,
        currentStreakDays: profile.balance.current_streak_days,
      },
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return serverError("Failed to fetch user profile");
  }
});

/**
 * Update current user profile.
 * PATCH /api/users/me
 * Body: { displayName?: string }
 */
export const updateMe = withAuth(async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
  try {
    // Parse request body
    let body: { displayName?: string };
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON body", 400);
    }

    // Validate
    if (body.displayName !== undefined && typeof body.displayName !== "string") {
      return error("displayName must be a string", 400);
    }

    // Update user
    const user = await updateUser(auth.userId, {
      displayName: body.displayName,
    });

    if (!user) {
      return notFound("User not found");
    }

    return success({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      updatedAt: user.updated_at,
    });
  } catch (err) {
    console.error("Error updating user:", err);
    return serverError("Failed to update user");
  }
});

/**
 * Delete current user account.
 * DELETE /api/users/me
 */
export const deleteMe = withAuth(async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
  try {
    const deleted = await deleteUser(auth.userId);

    if (!deleted) {
      return notFound("User not found");
    }

    return success({ deleted: true });
  } catch (err) {
    console.error("Error deleting user:", err);
    return serverError("Failed to delete user");
  }
});
```

---

### 2.6 Updated Server with Routes

#### `src/index.ts` (Final Phase 2 version)

```typescript
import { config } from "./config";
import { checkDbConnection } from "./db/client";
import { healthCheck } from "./routes/health";
import { getMe, updateMe, deleteMe } from "./routes/users";
import { handleClerkWebhook } from "./webhooks/clerk";
import { notFound, error } from "./utils/response";

console.log(`Starting BuyTime Backend in ${config.nodeEnv} mode...`);

// Verify required environment variables
const requiredEnvVars = ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_WEBHOOK_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`✗ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}
console.log("✓ Environment variables configured");

// Verify database connection on startup
try {
  await checkDbConnection();
  console.log("✓ Database connected successfully");
} catch (err) {
  console.error("✗ Database connection failed:", err);
  process.exit(1);
}

// CORS headers for iOS app
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Route handler type
type RouteHandler = (req: Request) => Promise<Response>;

// Define routes
const routes: Record<string, Record<string, RouteHandler>> = {
  // Health check
  "GET /health": { handler: healthCheck },

  // User routes (authenticated)
  "GET /api/users/me": { handler: getMe },
  "PATCH /api/users/me": { handler: updateMe },
  "DELETE /api/users/me": { handler: deleteMe },

  // Webhooks (no auth, verified by signature)
  "POST /webhooks/clerk": { handler: handleClerkWebhook },
};

// Start HTTP server
const server = Bun.serve({
  port: config.port,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Find matching route
    const routeKey = `${method} ${path}`;
    const route = routes[routeKey];

    if (route) {
      try {
        const response = await route.handler(req);

        // Add CORS headers to response
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });

        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (err) {
        console.error(`Error handling ${routeKey}:`, err);
        return error("Internal server error", 500);
      }
    }

    // 404 for unknown routes
    return notFound(`Route not found: ${method} ${path}`);
  },

  error(err: Error): Response {
    console.error("Server error:", err);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`✓ Server running at http://localhost:${server.port}`);
console.log(`
Available routes:
  GET  /health           - Health check
  GET  /api/users/me     - Get current user (auth required)
  PATCH /api/users/me    - Update current user (auth required)
  DELETE /api/users/me   - Delete current user (auth required)
  POST /webhooks/clerk   - Clerk webhook endpoint
`);
```

---

### 2.7 Testing

#### `tests/config.test.ts`

```typescript
import { test, expect, describe } from "bun:test";
import {
  FOCUS_MODES,
  isValidFocusMode,
  getMultiplier,
  calculateReward,
} from "../src/config";

describe("Focus Modes", () => {
  test("should have correct multipliers", () => {
    expect(FOCUS_MODES.fun.multiplier).toBe(150);
    expect(FOCUS_MODES.easy.multiplier).toBe(100);
    expect(FOCUS_MODES.medium.multiplier).toBe(50);
    expect(FOCUS_MODES.hard.multiplier).toBe(25);
  });

  test("isValidFocusMode returns true for valid modes", () => {
    expect(isValidFocusMode("fun")).toBe(true);
    expect(isValidFocusMode("easy")).toBe(true);
    expect(isValidFocusMode("medium")).toBe(true);
    expect(isValidFocusMode("hard")).toBe(true);
  });

  test("isValidFocusMode returns false for invalid modes", () => {
    expect(isValidFocusMode("invalid")).toBe(false);
    expect(isValidFocusMode("")).toBe(false);
    expect(isValidFocusMode("EASY")).toBe(false);
  });

  test("getMultiplier returns correct values", () => {
    expect(getMultiplier("fun")).toBe(150);
    expect(getMultiplier("easy")).toBe(100);
    expect(getMultiplier("medium")).toBe(50);
    expect(getMultiplier("hard")).toBe(25);
  });
});

describe("Reward Calculation", () => {
  test("Fun mode: 60 min focus = 90 min reward", () => {
    expect(calculateReward(60, "fun")).toBe(90);
  });

  test("Easy mode: 60 min focus = 60 min reward", () => {
    expect(calculateReward(60, "easy")).toBe(60);
  });

  test("Medium mode: 60 min focus = 30 min reward", () => {
    expect(calculateReward(60, "medium")).toBe(30);
  });

  test("Hard mode: 60 min focus = 15 min reward", () => {
    expect(calculateReward(60, "hard")).toBe(15);
  });

  test("Rounds to nearest minute", () => {
    // 45 * 0.50 = 22.5 -> 23
    expect(calculateReward(45, "medium")).toBe(23);

    // 33 * 1.50 = 49.5 -> 50
    expect(calculateReward(33, "fun")).toBe(50);
  });

  test("Handles zero duration", () => {
    expect(calculateReward(0, "easy")).toBe(0);
  });
});
```

#### `tests/auth.test.ts`

```typescript
import { test, expect, describe, mock } from "bun:test";
import { verifyAuthToken } from "../src/middleware/auth";

describe("Auth Middleware", () => {
  test("returns null for missing Authorization header", async () => {
    const req = new Request("http://localhost:3000/api/test");
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });

  test("returns null for malformed Authorization header", async () => {
    const req = new Request("http://localhost:3000/api/test", {
      headers: {
        Authorization: "InvalidFormat",
      },
    });
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });

  test("returns null for empty token", async () => {
    const req = new Request("http://localhost:3000/api/test", {
      headers: {
        Authorization: "Bearer ",
      },
    });
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });
});
```

---

## Final Project Structure

After completing Phase 1 and 2, your project should look like this:

```
buytime-backend/
├── src/
│   ├── config/
│   │   └── index.ts            # ✅ Focus modes, config constants
│   ├── db/
│   │   ├── client.ts           # ✅ Neon database client
│   │   └── queries/
│   │       ├── users.ts        # ✅ User CRUD operations
│   │       └── preferences.ts  # ✅ User preferences queries
│   ├── middleware/
│   │   └── auth.ts             # ✅ Clerk JWT verification
│   ├── routes/
│   │   ├── health.ts           # ✅ Health check endpoint
│   │   ├── users.ts            # ✅ User API routes
│   │   └── preferences.ts      # ✅ Preferences API routes
│   ├── webhooks/
│   │   └── clerk.ts            # ✅ Clerk webhook handler
│   ├── types/
│   │   └── index.ts            # ✅ TypeScript interfaces
│   ├── utils/
│   │   └── response.ts         # ✅ HTTP response helpers
│   └── index.ts                # ✅ Main server entry point
├── tests/
│   ├── config.test.ts          # ✅ Configuration tests
│   └── auth.test.ts            # ✅ Auth middleware tests
├── .env                        # ✅ Environment variables (gitignored)
├── .env.example                # ✅ Example env file
├── package.json
├── tsconfig.json
├── DATABASE.md
├── PLAN.md
├── CLAUDE.md
└── README.md
```

---

## Testing Checklist

### Phase 1 Verification

- [ ] **Database Connection**: Run `bun run dev` and check for "✓ Database connected successfully"
- [ ] **Health Check**: `curl http://localhost:3000/health` returns `{"success":true,"data":{"status":"healthy",...}}`
- [ ] **Schema Created**: Verify tables exist in Neon Console SQL Editor:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  ```

### Phase 2 Verification

- [ ] **Clerk Webhook**: Configure webhook in Clerk Dashboard:
  1. Go to Clerk Dashboard > Webhooks
  2. Add endpoint: `https://your-domain.com/webhooks/clerk`
  3. Select events: `user.created`, `user.updated`, `user.deleted`
  4. Copy signing secret to `CLERK_WEBHOOK_SECRET`

- [ ] **Test User Creation**: Create a test user in Clerk and verify it appears in database:
  ```sql
  SELECT * FROM users;
  SELECT * FROM user_balance;
  SELECT * FROM user_stats;
  SELECT * FROM user_preferences;
  ```

- [ ] **Test API Authentication**: Get a JWT token from iOS app and test:
  ```bash
  curl -H "Authorization: Bearer YOUR_CLERK_JWT" http://localhost:3000/api/users/me
  ```

- [ ] **Run Unit Tests**: `bun test`

---

## Next Steps (Phase 3+)

After completing Phase 1 and 2, proceed to:

- **Phase 3**: Core API - Sessions (`POST /api/sessions/start`, `/end`, etc.)
- **Phase 4**: Core API - Balance (`GET /api/balance`, `POST /api/balance/spend`)
- **Phase 5**: Subscriptions & RevenueCat webhooks
- **Phase 6**: Stats endpoints
- **Phase 7**: Testing & Deployment

---

*Implementation guide for BuyTime Backend - Phases 1 & 2*
*Last updated: February 18, 2026*
