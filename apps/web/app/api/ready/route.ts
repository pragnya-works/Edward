import { db, user } from "@edward/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ReadinessCheck = {
  ok: boolean;
  detail?: string;
};

const READINESS_DETAIL_TIMEOUT = "timeout";
const READINESS_DETAIL_UNAVAILABLE = "unavailable";

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function logReadinessProbeFailure(target: string, error: unknown): void {
  console.error(`[ready] ${target} probe failed`, error);
}

function resolveApiHealthUrl(): string | null {
  const baseApiUrl =
    process.env.INTERNAL_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!baseApiUrl) {
    return null;
  }

  try {
    const normalizedBase = baseApiUrl.endsWith("/") ? baseApiUrl : `${baseApiUrl}/`;
    return new URL("./health", normalizedBase).toString();
  } catch {
    return null;
  }
}

async function checkDatabaseReadiness(): Promise<ReadinessCheck> {
  try {
    await db.select({ id: user.id }).from(user).limit(1);
    return { ok: true };
  } catch (error) {
    logReadinessProbeFailure("database", error);
    return {
      ok: false,
      detail: READINESS_DETAIL_UNAVAILABLE,
    };
  }
}

async function checkApiReadiness(): Promise<ReadinessCheck> {
  const apiHealthUrl = resolveApiHealthUrl();
  if (!apiHealthUrl) {
    return {
      ok: process.env.NODE_ENV !== "production",
      detail: "NEXT_PUBLIC_API_URL is missing or invalid",
    };
  }

  try {
    const response = await fetch(apiHealthUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: `API health endpoint responded with status ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    logReadinessProbeFailure("api", error);
    return {
      ok: false,
      detail: isAbortLikeError(error)
        ? READINESS_DETAIL_TIMEOUT
        : READINESS_DETAIL_UNAVAILABLE,
    };
  }
}

export async function GET(): Promise<Response> {
  const [database, api] = await Promise.all([
    checkDatabaseReadiness(),
    checkApiReadiness(),
  ]);

  const ready = database.ok && api.ok;

  return NextResponse.json(
    {
      status: ready ? "ready" : "degraded",
      checks: {
        database,
        api,
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
