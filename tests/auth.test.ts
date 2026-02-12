import { test, expect, describe } from "bun:test";
import { verifyAuthToken } from "../src/middleware/auth";

describe("Auth Middleware", () => {
  test("returns null for missing Authorization header", async () => {
    const req = new Request("http://localhost:8080/api/test");
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });

  test("returns null for malformed Authorization header", async () => {
    const req = new Request("http://localhost:8080/api/test", {
      headers: { Authorization: "InvalidFormat" },
    });
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });

  test("returns null for empty Bearer token", async () => {
    const req = new Request("http://localhost:8080/api/test", {
      headers: { Authorization: "Bearer " },
    });
    const result = await verifyAuthToken(req);
    expect(result).toBeNull();
  });
});
