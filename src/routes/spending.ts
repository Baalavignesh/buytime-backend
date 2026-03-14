import { withAuth } from "../middleware/auth";
import {
  recordSpending,
  getSpendingHistory,
  getSpendingSummary,
} from "../db/queries/spending";
import { success, error, notFound, serverError } from "../utils/response";
import type { AuthenticatedRequest, DeviceType, SpendingSource } from "../types";

const VALID_DEVICE_TYPES: DeviceType[] = ["iphone", "ipad", "mac", "chrome_extension"];
const VALID_SOURCES: SpendingSource[] = ["shield", "desktop_app", "browser_extension"];

export const recordSpendingHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      let body: {
        appIdentifier?: string;
        appName?: string;
        minutesSpent?: number;
        startedAt?: string;
        endedAt?: string;
        deviceType?: string;
        deviceName?: string;
        source?: string;
      };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return error("Invalid JSON body", 400);
      }

      // Validate required fields
      if (body.minutesSpent === undefined) {
        return error("minutesSpent is required", 400);
      }
      if (
        typeof body.minutesSpent !== "number" ||
        !Number.isInteger(body.minutesSpent) ||
        body.minutesSpent < 1 ||
        body.minutesSpent > 1440
      ) {
        return error("minutesSpent must be an integer between 1 and 1440", 400);
      }

      if (!body.startedAt) {
        return error("startedAt is required", 400);
      }

      if (!body.deviceType) {
        return error("deviceType is required", 400);
      }
      if (!VALID_DEVICE_TYPES.includes(body.deviceType as DeviceType)) {
        return error(`deviceType must be one of: ${VALID_DEVICE_TYPES.join(", ")}`, 400);
      }

      if (!body.source) {
        return error("source is required", 400);
      }
      if (!VALID_SOURCES.includes(body.source as SpendingSource)) {
        return error(`source must be one of: ${VALID_SOURCES.join(", ")}`, 400);
      }

      // Validate optional string fields
      if (body.appIdentifier !== undefined && typeof body.appIdentifier !== "string") {
        return error("appIdentifier must be a string", 400);
      }
      if (body.appName !== undefined && typeof body.appName !== "string") {
        return error("appName must be a string", 400);
      }
      if (body.deviceName !== undefined && typeof body.deviceName !== "string") {
        return error("deviceName must be a string", 400);
      }

      const result = await recordSpending(auth.userId, {
        appIdentifier: body.appIdentifier ?? null,
        appName: body.appName ?? null,
        minutesSpent: body.minutesSpent,
        startedAt: body.startedAt,
        endedAt: body.endedAt ?? null,
        deviceType: body.deviceType as DeviceType,
        deviceName: body.deviceName ?? null,
        source: body.source as SpendingSource,
      });

      if (!result) {
        return error("Insufficient balance or user not found", 400);
      }

      return success({
        spending: {
          id: result.spending.id,
          appIdentifier: result.spending.app_identifier,
          appName: result.spending.app_name,
          minutesSpent: result.spending.minutes_spent,
          startedAt: result.spending.started_at,
          endedAt: result.spending.ended_at,
          deviceType: result.spending.device_type,
          deviceName: result.spending.device_name,
          source: result.spending.source,
        },
        balance: {
          availableMinutes: result.available_minutes,
        },
      });
    } catch (err) {
      console.error("Error recording spending:", err);
      return serverError("Failed to record spending");
    }
  }
);

export const getSpendingHistoryHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit") ?? "20";
      const offsetParam = url.searchParams.get("offset") ?? "0";
      const deviceType = url.searchParams.get("deviceType") ?? undefined;
      const source = url.searchParams.get("source") ?? undefined;
      const startDate = url.searchParams.get("startDate") ?? undefined;
      const endDate = url.searchParams.get("endDate") ?? undefined;

      const limit = parseInt(limitParam, 10);
      const offset = parseInt(offsetParam, 10);

      if (isNaN(limit) || limit < 1 || limit > 100) {
        return error("limit must be an integer between 1 and 100", 400);
      }
      if (isNaN(offset) || offset < 0) {
        return error("offset must be a non-negative integer", 400);
      }
      if (deviceType && !VALID_DEVICE_TYPES.includes(deviceType as DeviceType)) {
        return error(`deviceType must be one of: ${VALID_DEVICE_TYPES.join(", ")}`, 400);
      }
      if (source && !VALID_SOURCES.includes(source as SpendingSource)) {
        return error(`source must be one of: ${VALID_SOURCES.join(", ")}`, 400);
      }

      const { records, total } = await getSpendingHistory(auth.userId, limit, offset, {
        deviceType: deviceType as DeviceType | undefined,
        source: source as SpendingSource | undefined,
        startDate,
        endDate,
      });

      return success({
        records: records.map((r) => ({
          id: r.id,
          appIdentifier: r.app_identifier,
          appName: r.app_name,
          minutesSpent: r.minutes_spent,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          deviceType: r.device_type,
          deviceName: r.device_name,
          source: r.source,
          createdAt: r.created_at,
        })),
        pagination: { total, limit, offset },
      });
    } catch (err) {
      console.error("Error fetching spending history:", err);
      return serverError("Failed to fetch spending history");
    }
  }
);

export const getSpendingSummaryHandler = withAuth(
  async (req: Request, auth: AuthenticatedRequest): Promise<Response> => {
    try {
      const summary = await getSpendingSummary(auth.userId);

      if (!summary) {
        return notFound("User not found");
      }

      return success({
        todaySpentMinutes: summary.today_spent_minutes,
        totalSpentMinutes: summary.total_spent_minutes,
        totalRecords: summary.total_records,
        byDevice: summary.by_device.map((d) => ({
          deviceType: d.device_type,
          minutes: d.minutes,
          count: d.count,
        })),
        topApps: summary.top_apps.map((a) => ({
          appIdentifier: a.app_identifier,
          appName: a.app_name,
          minutes: a.minutes,
          count: a.count,
        })),
      });
    } catch (err) {
      console.error("Error fetching spending summary:", err);
      return serverError("Failed to fetch spending summary");
    }
  }
);
