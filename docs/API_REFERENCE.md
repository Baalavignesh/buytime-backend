# BuyTime API Reference

> For use by the iOS Swift client. Keep this file alongside your Xcode project as a reference for all backend API calls.
>
> **Base URL:** `https://<your-fly-domain>` (local: `http://localhost:8080`)

---

## Authentication

All `/api/*` endpoints require a Clerk JWT in the `Authorization` header.

```
Authorization: Bearer <clerk_jwt_token>
```

Get this token from the Clerk iOS SDK:

```swift
// Example using Clerk iOS SDK
let token = try await clerk.session?.getToken()
```

Webhook endpoints (`/webhooks/*`) do **not** use JWT auth — they use signature verification handled server-side.

---

## Response Format

All responses follow this shape:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": "Error message string"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200  | Success |
| 201  | Created |
| 400  | Bad request (invalid body/params) |
| 401  | Unauthorized (missing or invalid JWT) |
| 404  | Resource not found |
| 409  | Conflict (e.g. session already active) |
| 500  | Internal server error |

---

## Endpoints

### Health Check

#### `GET /health`

No authentication required.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-12T10:00:00.000Z",
    "database": "connected"
  }
}
```

---

### Users

#### `GET /api/users/me`

Get the current authenticated user's profile, balance, and basic stats.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "displayName": "John Doe",
    "subscriptionTier": "free",
    "subscriptionStatus": "none",
    "subscriptionExpiresAt": null,
    "createdAt": "2026-02-12T10:00:00.000Z",
    "balance": {
      "availableMinutes": 0,
      "currentStreakDays": 0
    }
  }
}
```

**Error (404):** User not found in database. This means the Clerk webhook hasn't fired yet or failed. Consider retrying after a short delay.

---

#### `PATCH /api/users/me`

Update the current user's display name.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "displayName": "New Name"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `displayName` | `string` | No | Pass to update; omit to leave unchanged |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "displayName": "New Name",
    "updatedAt": "2026-02-12T10:30:00.000Z"
  }
}
```

---

#### `DELETE /api/users/me`

Delete the current user's account and all associated data (balance, stats, sessions, spending records). This is irreversible.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### Balance

#### `GET /api/balance`

Get the current user's reward balance and today's computed activity summary.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "availableMinutes": 120,
    "currentStreakDays": 3,
    "lastSessionDate": "2026-02-19",
    "updatedAt": "2026-02-20T08:00:00.000Z",
    "today": {
      "earnedMinutes": 45,
      "spentMinutes": 30,
      "sessionsCompleted": 2,
      "sessionsFailed": 0
    }
  }
}
```

`today` stats are computed live from `focus_sessions` and `time_spending` — always accurate, no caching.

---

#### `PATCH /api/balance`

Update the user's available minutes. The iOS app calls this when the user spends screen time on restricted apps.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "availableMinutes": 90
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `availableMinutes` | `integer` | Yes | Must be a non-negative integer |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "availableMinutes": 90,
    "currentStreakDays": 3,
    "lastSessionDate": "2026-02-19",
    "updatedAt": "2026-02-20T08:15:00.000Z"
  }
}
```

**Error (400):** Missing field, non-integer, or negative value.

---

### Webhooks (Server-to-Server)

These are called by Clerk, not by the iOS app.

#### `POST /webhooks/clerk`

Receives Clerk webhook events (`user.created`, `user.updated`, `user.deleted`). Verified via Svix signature headers.

**What it does for the iOS app:**
- When a user signs up via Clerk in the iOS app, Clerk fires `user.created`
- The backend automatically creates rows in `users`, `user_balance`, `user_stats`, and `user_preferences`
- After this, `GET /api/users/me` will return the user's profile

---

### Preferences

#### `GET /api/preferences`

Get the current user's default focus settings.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "focusDurationMinutes": 25,
    "focusMode": "easy",
    "updatedAt": "2026-02-18T12:00:00.000Z"
  }
}
```

---

#### `PATCH /api/preferences`

Update the current user's default focus settings. At least one field must be provided.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "focusDurationMinutes": 30,
  "focusMode": "medium"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `focusDurationMinutes` | `integer` | No | Must be between 1 and 240 |
| `focusMode` | `string` | No | One of: `fun`, `easy`, `medium`, `hard` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "focusDurationMinutes": 30,
    "focusMode": "medium",
    "updatedAt": "2026-02-18T12:30:00.000Z"
  }
}
```

**Error (400):** Invalid body, missing fields, or out-of-range values.

---

### Sessions

#### `POST /api/sessions/start`

Start a new focus session. Only one active session is allowed at a time.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "client-generated-uuid",
  "mode": "easy",
  "plannedDurationMinutes": 60
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | `string` (UUID) | No | Client-generated UUID. Enables idempotent retries. If omitted, the server generates one |
| `mode` | `string` | Yes | One of: `fun`, `easy`, `medium`, `hard` |
| `plannedDurationMinutes` | `integer` | No | Target duration (1–480). Omit for open-ended sessions |

**Response (201 — new session / 200 — idempotent retry):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "mode": "easy",
    "multiplierUsed": 75,
    "startedAt": "2026-02-21T10:00:00.000Z",
    "plannedDurationMinutes": 60,
    "status": "active"
  }
}
```

**Idempotency:** If `sessionId` is provided and a session with that ID already exists for this user, returns `200` with the existing session instead of creating a duplicate.

**Error (400):** Invalid or missing `mode`, or `plannedDurationMinutes` out of range.

**Error (409):** User already has a *different* active session. End or abandon it first.

---

#### `POST /api/sessions/end`

Complete a focus session and earn reward minutes. Updates balance and lifetime stats atomically.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "uuid-string",
  "actualDurationMinutes": 55
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | `string` (UUID) | Yes | ID of the active session to end |
| `actualDurationMinutes` | `integer` | Yes | Actual focus time reported by the iOS app. Must be ≥ 1 |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid-string",
      "mode": "easy",
      "status": "completed",
      "actualDurationMinutes": 55,
      "multiplierUsed": 75,
      "rewardMinutes": 41,
      "startedAt": "2026-02-21T10:00:00.000Z",
      "endedAt": "2026-02-21T10:55:00.000Z"
    },
    "balance": {
      "availableMinutes": 161,
      "currentStreakDays": 3
    }
  }
}
```

`rewardMinutes` is calculated as `floor(actualDurationMinutes × multiplierUsed / 100)`.

**Error (400):** Missing or invalid fields.

**Idempotency:** If the session is already completed, returns `200` with the existing completed session data and current balance.

**Error (404):** Session not found or not owned by this user.

---

#### `POST /api/sessions/abandon`

Abandon an active session. If `penaltyMinutes` is provided, that amount is deducted from the user's available balance (floored at 0). The iOS app should send half the already-earned reward time as the penalty; if there's no earned time, omit `penaltyMinutes` or send 0.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "uuid-string",
  "penaltyMinutes": 15
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | `string` (UUID) | Yes | ID of the active session to abandon |
| `penaltyMinutes` | `number` | No | Minutes to deduct from balance (0–1440). Typically half the earned time. Defaults to 0 |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "mode": "easy",
    "status": "failed",
    "startedAt": "2026-02-21T10:00:00.000Z",
    "endedAt": "2026-02-21T10:20:00.000Z",
    "penaltyMinutes": 15,
    "balance": {
      "availableMinutes": 105
    }
  }
}
```

**Idempotency:** If the session is already failed/abandoned, returns `200` with the existing session data (penalty 0, current balance).

**Error (400):** Invalid `penaltyMinutes` value.

**Error (404):** Session not found or not owned by this user.

---

#### `GET /api/sessions/current`

Get the user's currently active session, if any.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid-string",
      "mode": "easy",
      "multiplierUsed": 75,
      "startedAt": "2026-02-21T10:00:00.000Z",
      "plannedDurationMinutes": 60,
      "status": "active"
    }
  }
}
```

`session` is `null` if no session is currently active.

---

#### `GET /api/sessions/history`

Get a paginated list of the user's past sessions.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | `integer` | `20` | Max results per page (1–100) |
| `offset` | `integer` | `0` | Pagination offset |
| `status` | `string` | all | Filter by status: `active`, `completed`, or `failed` |

**Example:** `GET /api/sessions/history?limit=20&offset=0&status=completed`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid-string",
        "mode": "easy",
        "multiplierUsed": 75,
        "status": "completed",
        "plannedDurationMinutes": 60,
        "actualDurationMinutes": 55,
        "rewardMinutes": 41,
        "startedAt": "2026-02-21T10:00:00.000Z",
        "endedAt": "2026-02-21T10:55:00.000Z",
        "createdAt": "2026-02-21T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 42,
      "limit": 20,
      "offset": 0
    }
  }
}
```

---

### Time Spending

#### `POST /api/spending`

Record time spent using entertainment apps. Deducts `minutesSpent` from the user's available balance and updates lifetime stats atomically. Returns an error if balance is insufficient.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "minutesSpent": 15,
  "startedAt": "2026-03-14T10:00:00.000Z",
  "endedAt": "2026-03-14T10:15:00.000Z",
  "deviceType": "iphone",
  "source": "shield",
  "appIdentifier": null,
  "appName": null,
  "deviceName": "iPhone 16 Pro"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `minutesSpent` | `integer` | Yes | Minutes consumed (1–1440) |
| `startedAt` | `string` (ISO 8601) | Yes | When app usage started |
| `endedAt` | `string` (ISO 8601) | No | When app usage ended |
| `deviceType` | `string` | Yes | `iphone`, `ipad`, `mac`, or `chrome_extension` |
| `source` | `string` | Yes | `shield` (iOS), `desktop_app`, or `browser_extension` |
| `appIdentifier` | `string` | No | Bundle ID, domain, or exe name. NULL on iOS |
| `appName` | `string` | No | Human-readable app name. NULL on iOS |
| `deviceName` | `string` | No | Device name (e.g. `"MacBook Pro"`) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "spending": {
      "id": "uuid-string",
      "appIdentifier": null,
      "appName": null,
      "minutesSpent": 15,
      "startedAt": "2026-03-14T10:00:00.000Z",
      "endedAt": "2026-03-14T10:15:00.000Z",
      "deviceType": "iphone",
      "deviceName": "iPhone 16 Pro",
      "source": "shield"
    },
    "balance": {
      "availableMinutes": 105
    }
  }
}
```

**Error (400):** Insufficient balance or user not found.

---

#### `GET /api/spending/history`

Get a paginated list of the user's time spending records with optional filters.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | `integer` | `20` | Max results per page (1–100) |
| `offset` | `integer` | `0` | Pagination offset |
| `deviceType` | `string` | all | Filter: `iphone`, `ipad`, `mac`, `chrome_extension` |
| `source` | `string` | all | Filter: `shield`, `desktop_app`, `browser_extension` |
| `startDate` | `string` (ISO 8601) | — | Filter records from this date |
| `endDate` | `string` (ISO 8601) | — | Filter records up to this date |

**Example:** `GET /api/spending/history?limit=20&offset=0&deviceType=mac`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "uuid-string",
        "appIdentifier": "com.google.Chrome",
        "appName": "Google Chrome",
        "minutesSpent": 30,
        "startedAt": "2026-03-14T10:00:00.000Z",
        "endedAt": "2026-03-14T10:30:00.000Z",
        "deviceType": "mac",
        "deviceName": "MacBook Pro",
        "source": "desktop_app",
        "createdAt": "2026-03-14T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0
    }
  }
}
```

---

#### `GET /api/spending/summary`

Get aggregate spending stats: today's total, lifetime total, breakdown by device, and top apps (desktop/browser only).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "todaySpentMinutes": 45,
    "totalSpentMinutes": 1200,
    "totalRecords": 87,
    "byDevice": [
      { "deviceType": "iphone", "minutes": 800, "count": 50 },
      { "deviceType": "mac", "minutes": 400, "count": 37 }
    ],
    "topApps": [
      { "appIdentifier": "com.google.Chrome", "appName": "Google Chrome", "minutes": 200, "count": 15 },
      { "appIdentifier": "com.spotify.client", "appName": "Spotify", "minutes": 100, "count": 10 }
    ]
  }
}
```

`topApps` only includes records where `appIdentifier` is not NULL (desktop/browser sources). Limited to top 10.

---

## Swift Integration Notes

### Suggested NetworkManager pattern

```swift
enum APIError: Error {
    case unauthorized
    case notFound
    case badRequest(String)
    case serverError
    case decodingError
}

struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
}

class BuyTimeAPI {
    static let shared = BuyTimeAPI()

    private let baseURL = "https://your-app.fly.dev"  // Update this

    private func authHeaders() async throws -> [String: String] {
        guard let token = try await Clerk.shared.session?.getToken() else {
            throw APIError.unauthorized
        }
        return [
            "Authorization": "Bearer \(token)",
            "Content-Type": "application/json"
        ]
    }

    // GET /api/users/me
    func getUser() async throws -> UserProfile { ... }

    // PATCH /api/users/me
    func updateUser(displayName: String) async throws -> UserProfile { ... }

    // DELETE /api/users/me
    func deleteUser() async throws { ... }

    // GET /api/preferences
    func getPreferences() async throws -> UserPreferences { ... }

    // PATCH /api/preferences
    func updatePreferences(focusDurationMinutes: Int?, focusMode: String?) async throws -> UserPreferences { ... }

    // GET /api/balance
    func getBalance() async throws -> Balance { ... }

    // PATCH /api/balance
    func updateBalance(availableMinutes: Int) async throws -> Balance { ... }

    // POST /api/sessions/start
    func startSession(sessionId: UUID = UUID(), mode: String, plannedDurationMinutes: Int?) async throws -> FocusSession { ... }

    // POST /api/sessions/end
    func endSession(sessionId: String, actualDurationMinutes: Int) async throws -> SessionResult { ... }

    // POST /api/sessions/abandon
    func abandonSession(sessionId: String, penaltyMinutes: Int = 0) async throws -> AbandonResult { ... }

    // GET /api/sessions/current
    func getCurrentSession() async throws -> FocusSession? { ... }

    // GET /api/sessions/history
    func getSessionHistory(limit: Int, offset: Int, status: String?) async throws -> SessionHistory { ... }

    // POST /api/spending
    func recordSpending(minutesSpent: Int, startedAt: Date, endedAt: Date?, deviceType: String, source: String, appIdentifier: String?, appName: String?, deviceName: String?) async throws -> SpendingResult { ... }

    // GET /api/spending/history
    func getSpendingHistory(limit: Int, offset: Int, deviceType: String?, source: String?, startDate: Date?, endDate: Date?) async throws -> SpendingHistory { ... }

    // GET /api/spending/summary
    func getSpendingSummary() async throws -> SpendingSummary { ... }
}
```

### Handling the webhook timing gap

After a user signs up via Clerk in the iOS app, there's a brief delay before the webhook fires and creates the DB user. Handle this in the app:

```swift
// After Clerk sign-up completes, poll for user creation
func waitForUserCreation(maxRetries: Int = 5) async throws -> UserProfile {
    for attempt in 0..<maxRetries {
        do {
            return try await BuyTimeAPI.shared.getUser()
        } catch APIError.notFound {
            // User not yet created by webhook, wait and retry
            try await Task.sleep(for: .seconds(1))
            continue
        }
    }
    throw APIError.notFound
}
```

---

## Data Types Reference

### UserProfile

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (UUID) | Internal DB ID |
| `email` | `String?` | From Clerk |
| `displayName` | `String?` | From Clerk or user-set |
| `subscriptionTier` | `String` | `"free"` or `"premium"` |
| `subscriptionStatus` | `String` | `"none"`, `"active"`, `"expired"`, `"cancelled"` |
| `subscriptionExpiresAt` | `String?` | ISO 8601 datetime or null |
| `createdAt` | `String` | ISO 8601 datetime |
| `balance.availableMinutes` | `Int` | Spendable reward minutes |
| `balance.currentStreakDays` | `Int` | Consecutive days with sessions |

### UserPreferences

| Field | Type | Notes |
|-------|------|-------|
| `focusDurationMinutes` | `Int` | Default focus duration (1-240) |
| `focusMode` | `String` | Default mode: `fun`, `easy`, `medium`, `hard` |
| `updatedAt` | `String` | ISO 8601 datetime |

### Balance

| Field | Type | Notes |
|-------|------|-------|
| `availableMinutes` | `Int` | Spendable reward minutes |
| `currentStreakDays` | `Int` | Consecutive days with completed sessions |
| `lastSessionDate` | `String?` | ISO 8601 date or null |
| `updatedAt` | `String` | ISO 8601 datetime |
| `today.earnedMinutes` | `Int` | Reward minutes earned today (computed live) |
| `today.spentMinutes` | `Int` | Reward minutes spent today (computed live) |
| `today.sessionsCompleted` | `Int` | Completed focus sessions today |
| `today.sessionsFailed` | `Int` | Failed focus sessions today |

> `today` fields are only present on `GET /api/balance`, not on the `PATCH` response.

### FocusSession

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (UUID) | Session identifier |
| `mode` | `String` | `fun`, `easy`, `medium`, or `hard` |
| `multiplierUsed` | `Int` | Reward multiplier snapshot at session start |
| `status` | `String` | `active`, `completed`, or `failed` |
| `plannedDurationMinutes` | `Int?` | Target duration, or null for open-ended |
| `actualDurationMinutes` | `Int?` | Actual focus time (set on end/abandon) |
| `rewardMinutes` | `Int?` | Reward earned (set on completion only) |
| `startedAt` | `String` | ISO 8601 datetime |
| `endedAt` | `String?` | ISO 8601 datetime, or null if still active |
| `createdAt` | `String` | ISO 8601 datetime |

### TimeSpending

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (UUID) | Spending record identifier |
| `appIdentifier` | `String?` | Bundle ID, domain, or exe name. NULL on iOS |
| `appName` | `String?` | Human-readable app name. NULL on iOS |
| `minutesSpent` | `Int` | Reward minutes consumed |
| `startedAt` | `String` | ISO 8601 datetime |
| `endedAt` | `String?` | ISO 8601 datetime, or null |
| `deviceType` | `String` | `iphone`, `ipad`, `mac`, `chrome_extension` |
| `deviceName` | `String?` | User-facing device name |
| `source` | `String` | `shield`, `desktop_app`, `browser_extension` |
| `createdAt` | `String` | ISO 8601 datetime |

### Focus Modes

| Mode | Multiplier | Reward per 60 min focus |
|------|-----------|------------------------|
| `fun` | 100% | 60 min |
| `easy` | 75% | 45 min |
| `medium` | 50% | 30 min |
| `hard` | 25% | 15 min |

---

*Last updated: March 14, 2026 — Added time spending endpoints (record, history, summary) with multi-platform support*
