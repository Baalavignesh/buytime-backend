import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config";
import { unauthorized } from "../utils/response";
import type { AuthenticatedRequest } from "../types";

const clerk = createClerkClient({
  secretKey: config.clerkSecretKey,
});

export async function verifyAuthToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  if (!token) {
    return null;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
    });
    return payload.sub;
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}

export function withAuth(
  handler: (req: Request, auth: AuthenticatedRequest) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const userId = await verifyAuthToken(req);

    if (!userId) {
      return unauthorized("Invalid or missing authentication token");
    }

    return handler(req, { userId });
  };
}

export function getClerkClient() {
  return clerk;
}
