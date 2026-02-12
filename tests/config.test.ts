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
    expect(calculateReward(45, "medium")).toBe(23);
    expect(calculateReward(33, "fun")).toBe(50);
  });

  test("Handles zero duration", () => {
    expect(calculateReward(0, "easy")).toBe(0);
  });
});
