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

ALTER TABLE focus_sessions
ADD CONSTRAINT valid_mode CHECK (mode IN ('fun', 'easy', 'medium', 'hard'));

-- ============================================
-- USER BALANCE TABLE
-- One row per user (user_id is PK)
-- ============================================
CREATE TABLE user_balance (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    available_minutes INTEGER DEFAULT 0,
    current_streak_days INTEGER DEFAULT 0,
    last_session_date DATE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- USER STATS TABLE
-- Lifetime statistics, one row per user
-- ============================================
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_sessions_completed INTEGER DEFAULT 0,
    total_sessions_failed INTEGER DEFAULT 0,
    total_focus_minutes INTEGER DEFAULT 0,
    total_earned_minutes INTEGER DEFAULT 0,
    total_spent_minutes INTEGER DEFAULT 0,
    longest_streak_days INTEGER DEFAULT 0,
    longest_session_minutes INTEGER DEFAULT 0,
    best_daily_focus_minutes INTEGER DEFAULT 0,
    most_sessions_in_day INTEGER DEFAULT 0,
    sessions_fun_mode INTEGER DEFAULT 0,
    sessions_easy_mode INTEGER DEFAULT 0,
    sessions_medium_mode INTEGER DEFAULT 0,
    sessions_hard_mode INTEGER DEFAULT 0,
    unique_apps_unlocked INTEGER DEFAULT 0,
    most_used_app_bundle_id TEXT,
    most_used_app_minutes INTEGER DEFAULT 0,
    first_session_at TIMESTAMP,
    total_days_active INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TIME SPENDING TABLE
-- Log of reward time spent on apps
-- ============================================
CREATE TABLE time_spending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_bundle_id TEXT NOT NULL,
    app_name TEXT,
    minutes_spent INTEGER NOT NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_spending_user ON time_spending(user_id);
CREATE INDEX idx_spending_app ON time_spending(app_bundle_id);
CREATE INDEX idx_spending_date ON time_spending(started_at);

-- ============================================
-- HELPER FUNCTION: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_balance_timestamp
    BEFORE UPDATE ON user_balance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_stats_timestamp
    BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
