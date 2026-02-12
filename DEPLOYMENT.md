# BuyTime Backend - Deployment Guide

> Step-by-step guide to deploy your Bun backend on Fly.io with Cloudflare DNS.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Part 1: Prepare Your Project](#part-1-prepare-your-project)
4. [Part 2: Fly.io Setup](#part-2-flyio-setup)
5. [Part 3: Deploy to Fly.io](#part-3-deploy-to-flyio)
6. [Part 4: Configure Environment Variables](#part-4-configure-environment-variables)
7. [Part 5: Cloudflare DNS Setup](#part-5-cloudflare-dns-setup)
8. [Part 6: SSL/HTTPS Configuration](#part-6-sslhttps-configuration)
9. [Part 7: Verify Deployment](#part-7-verify-deployment)
10. [Ongoing Operations](#ongoing-operations)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────┐
│    iOS App      │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────┐
│  api.baalavignesh.com           │
│  (Cloudflare DNS + Proxy)       │
└────────┬────────────────────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────┐
│  Fly.io                         │
│  ┌───────────────────────────┐  │
│  │  buytime-backend          │  │
│  │  (Bun Server)             │  │
│  └───────────────────────────┘  │
└────────┬────────────────────────┘
         │ PostgreSQL (SSL)
         ▼
┌─────────────────────────────────┐
│  Neon PostgreSQL                │
│  (Serverless Database)          │
└─────────────────────────────────┘
```

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Bun installed**: `curl -fsSL https://bun.sh/install | bash`
- [ ] **Git installed**: Your project should be in a git repo
- [ ] **Cloudflare account**: With `baalavignesh.com` domain configured
- [ ] **Neon database**: Already set up with schema (from Phase 1)
- [ ] **Clerk account**: With API keys ready

---

## Part 1: Prepare Your Project

### 1.1 Create Dockerfile

Fly.io uses Docker to build and run your app. Create a `Dockerfile` in your project root:

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Run the app
FROM base AS runner
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the server
CMD ["bun", "run", "src/index.ts"]
```

### 1.2 Create .dockerignore

Prevent unnecessary files from being included in the Docker image:

```
# .dockerignore
node_modules
.git
.gitignore
*.md
.env
.env.*
!.env.example
tests
*.test.ts
.DS_Store
```

### 1.3 Update Your Server Port

Make sure your server reads the PORT from environment (Fly.io uses port 8080 internally):

```typescript
// In src/index.ts or src/config/index.ts
const port = parseInt(process.env.PORT || "3000", 10);
```

### 1.4 Add Health Check Endpoint

Fly.io needs a health check endpoint. You should already have this from Phase 1:

```typescript
// GET /health should return 200 OK
// This is used by Fly.io to know your app is healthy
```

### 1.5 Commit Your Changes

```bash
git add Dockerfile .dockerignore
git commit -m "Add Dockerfile for Fly.io deployment"
```

---

## Part 2: Fly.io Setup

### 2.1 Create Fly.io Account

1. Go to [fly.io](https://fly.io)
2. Click "Sign Up" (you can use GitHub)
3. You may need to add a credit card (won't be charged on free tier)

### 2.2 Install Fly CLI (flyctl)

**macOS (Homebrew):**
```bash
brew install flyctl
```

**macOS/Linux (curl):**
```bash
curl -L https://fly.io/install.sh | sh
```

**Verify installation:**
```bash
fly version
```

### 2.3 Login to Fly.io

```bash
fly auth login
```

This opens a browser window to authenticate.

---

## Part 3: Deploy to Fly.io

### 3.1 Launch Your App

Navigate to your project directory and run:

```bash
cd /path/to/buytime-backend
fly launch
```

You'll be prompted with questions:

```
? Choose an app name: buytime-api
? Choose a region: sjc (San Jose, California) # Choose closest to your users
? Would you like to set up a PostgreSQL database? No  # We use Neon
? Would you like to set up an Upstash Redis database? No
? Would you like to deploy now? No  # We'll set env vars first
```

This creates a `fly.toml` configuration file.

### 3.2 Review fly.toml

Your `fly.toml` should look similar to this (adjust as needed):

```toml
# fly.toml
app = "buytime-api"
primary_region = "sjc"

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1

[checks]
  [checks.health]
    type = "http"
    port = 8080
    path = "/health"
    interval = "30s"
    timeout = "5s"
```

### 3.3 Recommended fly.toml Settings

For a production API, consider these settings:

```toml
# fly.toml
app = "buytime-api"
primary_region = "sjc"

[build]

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false  # Keep at least 1 machine running
  auto_start_machines = true
  min_machines_running = 1    # Always have 1 machine ready
  processes = ["app"]

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1

[checks]
  [checks.health]
    type = "http"
    port = 8080
    path = "/health"
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
```

> **Note**: `min_machines_running = 1` keeps your API always available but uses more of your free tier. Set to `0` if you want to save resources and can tolerate cold starts.

---

## Part 4: Configure Environment Variables

### 4.1 Set Secrets (Sensitive Data)

Use `fly secrets` for sensitive environment variables:

```bash
# Database URL from Neon
fly secrets set DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"

# Clerk authentication
fly secrets set CLERK_SECRET_KEY="sk_live_xxxxxxxxxxxxx"
fly secrets set CLERK_PUBLISHABLE_KEY="pk_live_xxxxxxxxxxxxx"
fly secrets set CLERK_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxx"
```

### 4.2 Verify Secrets Are Set

```bash
fly secrets list
```

Output:
```
NAME                    DIGEST                  CREATED AT
CLERK_PUBLISHABLE_KEY   xxxxxxxxxxxxxxxx        1m ago
CLERK_SECRET_KEY        xxxxxxxxxxxxxxxx        1m ago
CLERK_WEBHOOK_SECRET    xxxxxxxxxxxxxxxx        1m ago
DATABASE_URL            xxxxxxxxxxxxxxxx        1m ago
```

### 4.3 Non-Sensitive Environment Variables

Add these to `fly.toml` under `[env]`:

```toml
[env]
  NODE_ENV = "production"
  # Add any non-sensitive config here
```

---

## Part 5: Deploy Your App

### 5.1 First Deployment

Now deploy your application:

```bash
fly deploy
```

This will:
1. Build your Docker image
2. Push it to Fly.io's registry
3. Start your application
4. Run health checks

Watch the output for any errors.

### 5.2 Verify Deployment

```bash
# Check app status
fly status

# View recent logs
fly logs

# Open your app in browser
fly open
```

Your app is now live at: `https://buytime-api.fly.dev`

### 5.3 Test the Health Endpoint

```bash
curl https://buytime-api.fly.dev/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-02T...",
    "database": "connected"
  }
}
```

---

## Part 6: Cloudflare DNS Setup

Now let's connect your custom domain.

### 6.1 Get Your Fly.io App Hostname

Your Fly.io hostname is: `buytime-api.fly.dev` (or whatever you named it)

### 6.2 Add Custom Domain to Fly.io

First, tell Fly.io about your custom domain:

```bash
fly certs create api.baalavignesh.com
```

Output will show:
```
Your certificate for api.baalavignesh.com is being issued.

Hostname                  = api.baalavignesh.com
DNS Provider              = cloudflare
Certificate Authority     = Let's Encrypt
Issued                    =
Added to App              =

Configure your DNS provider with:
  CNAME api -> buytime-api.fly.dev
```

### 6.3 Configure Cloudflare DNS

1. **Log in to Cloudflare Dashboard**: [dash.cloudflare.com](https://dash.cloudflare.com)

2. **Select your domain**: `baalavignesh.com`

3. **Go to DNS settings**: Click "DNS" in the left sidebar

4. **Add a CNAME record**:

   | Type | Name | Target | Proxy status |
   |------|------|--------|--------------|
   | CNAME | `api` | `buytime-api.fly.dev` | Proxied (orange cloud) |

   - **Type**: CNAME
   - **Name**: `api` (this creates api.baalavignesh.com)
   - **Target**: `buytime-api.fly.dev`
   - **Proxy status**: Proxied (orange cloud) for Cloudflare protection

5. **Click Save**

### 6.4 Cloudflare SSL/TLS Settings

1. Go to **SSL/TLS** in Cloudflare dashboard
2. Set encryption mode to **Full (strict)**

   This ensures:
   - Browser → Cloudflare: HTTPS
   - Cloudflare → Fly.io: HTTPS (verified)

### 6.5 Verify Certificate on Fly.io

Wait a few minutes, then check certificate status:

```bash
fly certs show api.baalavignesh.com
```

Expected output:
```
Hostname                  = api.baalavignesh.com
DNS Provider              = cloudflare
Certificate Authority     = Let's Encrypt
Issued                    = ecdsa, rsa
Added to App              = 2 minutes ago
```

### 6.6 Test Your Custom Domain

```bash
curl https://api.baalavignesh.com/health
```

---

## Part 7: Verify Deployment

### 7.1 Complete Verification Checklist

```bash
# 1. Check Fly.io app status
fly status

# 2. Test health endpoint via Fly.io domain
curl https://buytime-api.fly.dev/health

# 3. Test health endpoint via custom domain
curl https://api.baalavignesh.com/health

# 4. Check logs for any errors
fly logs --tail

# 5. Verify SSL certificate
curl -vI https://api.baalavignesh.com 2>&1 | grep -A5 "Server certificate"
```

### 7.2 Test API Endpoints

Once you've implemented the user routes:

```bash
# This should return 401 (no auth token)
curl https://api.baalavignesh.com/api/users/me

# Expected response:
# {"success":false,"error":"Invalid or missing authentication token"}
```

### 7.3 Update Clerk Webhook URL

In Clerk Dashboard:
1. Go to **Webhooks**
2. Update (or add) endpoint URL: `https://api.baalavignesh.com/webhooks/clerk`
3. Make sure events are selected: `user.created`, `user.updated`, `user.deleted`

---

## Ongoing Operations

### Deploy Updates

After making code changes:

```bash
git add .
git commit -m "Your changes"
fly deploy
```

### View Logs

```bash
# Stream live logs
fly logs --tail

# View recent logs
fly logs -n 100
```

### SSH into Your App

```bash
fly ssh console
```

### Scale Your App

```bash
# Add more machines
fly scale count 2

# Increase memory
fly scale memory 512
```

### Monitor Your App

```bash
# View app metrics
fly dashboard
```

Or visit: https://fly.io/apps/buytime-api

### Update Secrets

```bash
# Update a secret
fly secrets set CLERK_SECRET_KEY="new_value"

# Remove a secret
fly secrets unset OLD_SECRET
```

### Restart Your App

```bash
fly apps restart
```

---

## Troubleshooting

### App Won't Start

```bash
# Check build logs
fly logs --tail

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port mismatch (should be 8080)
```

### Database Connection Issues

1. Verify `DATABASE_URL` is set correctly:
   ```bash
   fly ssh console -C "echo \$DATABASE_URL"
   ```

2. Make sure Neon allows connections (it does by default)

3. Check your connection string has `?sslmode=require`

### Custom Domain Not Working

1. Check DNS propagation: [dnschecker.org](https://dnschecker.org)
2. Verify Fly.io certificate:
   ```bash
   fly certs list
   fly certs show api.baalavignesh.com
   ```
3. Make sure Cloudflare SSL mode is "Full (strict)"

### Health Check Failing

```bash
# Test locally first
bun run dev
curl http://localhost:3000/health

# Check if port matches fly.toml internal_port
# Should be 8080 for Fly.io
```

### Deployment Fails

```bash
# View detailed build output
fly deploy --verbose

# Check Dockerfile syntax
docker build -t test .
docker run -p 8080:8080 test
```

---

## Quick Reference

### Commands Cheat Sheet

| Task | Command |
|------|---------|
| Deploy | `fly deploy` |
| View status | `fly status` |
| View logs | `fly logs --tail` |
| Set secret | `fly secrets set KEY="value"` |
| List secrets | `fly secrets list` |
| SSH into app | `fly ssh console` |
| Restart app | `fly apps restart` |
| Open dashboard | `fly dashboard` |
| Add domain | `fly certs create domain.com` |
| Check domain | `fly certs show domain.com` |

### Important URLs

| Service | URL |
|---------|-----|
| Fly.io Dashboard | https://fly.io/apps/buytime-api |
| Your API (Fly.io) | https://buytime-api.fly.dev |
| Your API (Custom) | https://api.baalavignesh.com |
| Cloudflare Dashboard | https://dash.cloudflare.com |
| Neon Console | https://console.neon.tech |
| Clerk Dashboard | https://dashboard.clerk.com |

### Environment Variables Summary

| Variable | Where to Set | Description |
|----------|--------------|-------------|
| `DATABASE_URL` | `fly secrets` | Neon PostgreSQL connection string |
| `CLERK_SECRET_KEY` | `fly secrets` | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | `fly secrets` | Clerk publishable key |
| `CLERK_WEBHOOK_SECRET` | `fly secrets` | Clerk webhook signing secret |
| `NODE_ENV` | `fly.toml [env]` | Set to "production" |
| `PORT` | Auto-set by Fly.io | 8080 (don't override) |

---

## Cost Estimate (Fly.io Free Tier)

Fly.io's free tier includes:
- **3 shared-cpu-1x VMs** with 256MB RAM
- **3GB persistent storage** (we don't use this)
- **160GB outbound bandwidth**/month

For BuyTime backend:
- 1 VM with 256MB RAM = **Free**
- Outbound data for API responses = **Likely free** (well under 160GB)

You'll only pay if you:
- Need more than 1 VM
- Exceed bandwidth limits
- Want dedicated CPU

---

*Deployment guide for BuyTime Backend*
*Last updated: February 2, 2026*
