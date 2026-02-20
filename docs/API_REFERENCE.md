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
| 400  | Bad request (invalid body/params) |
| 401  | Unauthorized (missing or invalid JWT) |
| 404  | Resource not found |
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

### Focus Modes (for future session endpoints)

| Mode | Multiplier | Reward per 60min focus |
|------|-----------|----------------------|
| `fun` | 150% | 90 min |
| `easy` | 100% | 60 min |
| `medium` | 50% | 30 min |
| `hard` | 25% | 15 min |

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

---

*Last updated: February 20, 2026 — Phase 1, 2 + Preferences + Balance*
*Endpoints will be added here as new phases are implemented.*
