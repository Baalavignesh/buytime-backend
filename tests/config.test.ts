import { test, expect, describe } from "bun:test";
import {
  FOCUS_MODES,
  isValidFocusMode,
} from "../src/config";

describe("Focus Modes", () => {
  test("should have correct multipliers", () => {
    expect(FOCUS_MODES.fun.multiplier).toBe(100);
    expect(FOCUS_MODES.easy.multiplier).toBe(75);
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
});
