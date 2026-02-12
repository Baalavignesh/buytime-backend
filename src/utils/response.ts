import type { ApiResponse } from "../types";

export function jsonResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function success<T>(data: T): Response {
  const response: ApiResponse<T> = { success: true, data };
  return jsonResponse(response, 200);
}

export function error(message: string, status: number = 400): Response {
  const response: ApiResponse = { success: false, error: message };
  return jsonResponse(response, status);
}

export function notFound(message: string = "Not found"): Response {
  return error(message, 404);
}

export function unauthorized(message: string = "Unauthorized"): Response {
  return error(message, 401);
}

export function serverError(
  message: string = "Internal server error"
): Response {
  return error(message, 500);
}
