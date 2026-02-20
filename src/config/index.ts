export const FOCUS_MODES = {
  fun: {
    multiplier: 100,
    displayName: "Fun",
    description: "Lenient - 1x reward (1hr focus = 1hr reward)",
  },
  easy: {
    multiplier: 75,
    displayName: "Easy",
    description: "Balanced - 0.75x reward (1hr focus = 45min reward)",
  },
  medium: {
    multiplier: 50,
    displayName: "Medium",
    description: "Challenging - 0.5x reward (1hr focus = 30min reward)",
  },
  hard: {
    multiplier: 25,
    displayName: "Hard",
    description: "Hardcore - 0.25x reward (1hr focus = 15min reward)",
  },
} as const;

export type FocusMode = keyof typeof FOCUS_MODES;

export function isValidFocusMode(mode: string): mode is FocusMode {
  return mode in FOCUS_MODES;
}

export function getMultiplier(mode: FocusMode): number {
  return FOCUS_MODES[mode].multiplier;
}

export function calculateReward(
  durationMinutes: number,
  mode: FocusMode
): number {
  const multiplier = getMultiplier(mode);
  return Math.round(durationMinutes * (multiplier / 100));
}

export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDevelopment: process.env.NODE_ENV !== "production",

  // Clerk
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || "",
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET || "",
} as const;
