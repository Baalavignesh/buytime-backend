# BuyTime Backend

Backend API for BuyTime — a reward-driven screen time management iOS app that flips traditional restrictions into positive reinforcement.

## About BuyTime

BuyTime is a subscription-based iOS productivity app that uses an **earned-time reward system** to help users build healthier relationships with their devices. Instead of simply blocking apps, users earn screen time by completing focus sessions — the harder the mode, the less reward time earned, incentivizing users to challenge themselves.

### How It Works

1. **User selects a focus mode** — each mode has a different reward multiplier
2. **User completes a focus session** — the app tracks distraction-free time
3. **Reward minutes are calculated** — `focus_minutes × (multiplier / 100) = reward_minutes`
4. **User spends earned time** — unlocks restricted apps until their balance runs out

The app uses **Apple FamilyControls** for screen time monitoring and app restriction enforcement, and **Clerk** for authentication.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **Database:** [Neon](https://neon.tech) (Serverless PostgreSQL)
- **Authentication:** [Clerk](https://clerk.com)
- **Subscriptions:** [RevenueCat](https://revenuecat.com)

## Focus Modes

| Mode   | Multiplier | Example                  |
|--------|------------|--------------------------|
| Fun    | 150%       | 1hr focus = 1.5hr reward |
| Easy   | 100%       | 1hr focus = 1hr reward   |
| Medium | 50%        | 1hr focus = 30min reward |
| Hard   | 25%        | 1hr focus = 15min reward |

**Reward Formula:**
```
reward_minutes = focus_minutes × (multiplier / 100)
```

## API Endpoints

### Health

| Method | Endpoint      | Description                  |
|--------|---------------|------------------------------|
| GET    | `/health`     | Basic health check           |
| GET    | `/api/health` | Health check with DB status  |

### Users

| Method | Endpoint        | Description              | Auth |
|--------|-----------------|--------------------------|------|
| GET    | `/api/users/me` | Get current user profile | ✓    |
| PATCH  | `/api/users/me` | Update display name      | ✓    |

### Focus Sessions

| Method | Endpoint                     | Description            | Auth |
|--------|------------------------------|------------------------|------|
| POST   | `/api/sessions`              | Start a focus session  | ✓    |
| GET    | `/api/sessions`              | List user's sessions   | ✓    |
| GET    | `/api/sessions/:id`          | Get session details    | ✓    |
| PATCH  | `/api/sessions/:id/complete` | Complete a session     | ✓    |
| PATCH  | `/api/sessions/:id/fail`     | Mark session as failed | ✓    |

### Balance & Stats

| Method | Endpoint       | Description                          | Auth |
|--------|----------------|--------------------------------------|------|
| GET    | `/api/balance` | Get current balance + today's stats  | ✓    |
| PATCH  | `/api/balance` | Update available minutes             | ✓    |
| GET    | `/api/stats`   | Get lifetime statistics              | ✓    |

### Webhooks

| Method | Endpoint               | Description                      |
|--------|------------------------|----------------------------------|
| POST   | `/webhooks/clerk`      | Clerk user events                |
| POST   | `/webhooks/revenuecat` | RevenueCat subscription events   |

## Database Schema

### Tables

| Table            | Purpose                                      |
|------------------|----------------------------------------------|
| `users`          | User profiles + subscription status          |
| `focus_sessions` | Individual focus session records             |
| `user_balance`   | Current reward balance & streak (1 per user) |
| `user_stats`     | Lifetime statistics & records (1 per user)   |
| `time_spending`  | Log of reward time spent on apps             |

See [DATABASE.md](./DATABASE.md) for the complete schema and design details.

## Project Structure

```
src/
├── config/          # Constants (FOCUS_MODES, etc.)
├── db/
│   ├── client.ts    # Neon connection setup
│   └── queries/     # SQL query helpers per table
├── routes/          # API endpoint handlers
├── webhooks/        # Clerk and RevenueCat webhook processors
├── middleware/      # Auth (Clerk JWT verification)
├── services/        # Business logic (reward calculation, etc.)
└── types/           # TypeScript interfaces
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- A [Neon](https://neon.tech) database
- A [Clerk](https://clerk.com) application
- A [RevenueCat](https://revenuecat.com) project (for subscriptions)

### Installation

```bash
bun install
```

### Environment Variables

Create a `.env.local` file:

```env
DATABASE_URL=postgresql://user:pass@host/db
CLERK_SECRET_KEY=sk_live_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx
REVENUECAT_WEBHOOK_AUTH_KEY=xxxxx
PORT=3000
NODE_ENV=development
```

### Running the Server

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start
```

### Running Tests

```bash
bun test
bun test --watch
bun test path/to/file
```

## Authentication

All `/api/*` endpoints (except health) require a valid Clerk JWT:

```bash
curl -H "Authorization: Bearer <clerk_jwt>" http://localhost:3000/api/users/me
```

Webhooks use signature verification:
- **Clerk:** Svix signature via `svix-id`, `svix-timestamp`, `svix-signature` headers
- **RevenueCat:** Authorization header verification

