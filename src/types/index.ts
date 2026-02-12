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
  user?: User; // Database user (populated by middleware if needed)
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
