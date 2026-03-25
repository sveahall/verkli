import { timingSafeEqual } from "crypto";
import type { User } from "@supabase/supabase-js";
import { apiError, E_FORBIDDEN, E_UNAUTHORIZED } from "@/lib/api-errors";
import { createClient } from "@/lib/supabase/server";

type AdminRoleCheckResult =
  | {
      ok: true;
      user: User;
      profileRole: "admin";
    }
  | {
      ok: false;
      error: typeof E_UNAUTHORIZED | typeof E_FORBIDDEN;
      status: 401 | 403;
      profileRole: string | null;
    };

type AdminApiResult =
  | {
      user: User;
      response: null;
    }
  | {
      user: null;
      response: Response;
    };

type AdminOrOpsApiResult =
  | {
      access: "admin" | "ops";
      user: User | null;
      response: null;
    }
  | {
      access: null;
      user: null;
      response: Response;
    };

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function getConfiguredOpsHealthToken(): string | null {
  const raw =
    process.env.OPS_HEALTH_TOKEN?.trim() ||
    process.env.HEALTHCHECK_TOKEN?.trim() ||
    "";
  return raw.length > 0 ? raw : null;
}

function getPresentedOpsHealthToken(request: Request): string | null {
  const explicit =
    request.headers.get("x-ops-health-token")?.trim() ||
    request.headers.get("x-healthcheck-token")?.trim();
  if (explicit) return explicit;

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const bearerToken = authorization.slice("bearer ".length).trim();
  return bearerToken.length > 0 ? bearerToken : null;
}

export function hasValidOpsHealthToken(request: Request): boolean {
  const expected = getConfiguredOpsHealthToken();
  const provided = getPresentedOpsHealthToken(request);
  if (!expected || !provided) return false;
  return safeEquals(provided, expected);
}

async function loadCurrentUserRole(): Promise<{
  user: User | null;
  profileRole: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profileRole: null };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[admin auth] failed to load profile role", {
      userId: user.id,
      message: error.message,
    });
    return { user, profileRole: null };
  }

  return {
    user,
    profileRole: String(profile?.role ?? "").trim().toLowerCase() || null,
  };
}

export async function requireAdminRole(): Promise<AdminRoleCheckResult> {
  const { user, profileRole } = await loadCurrentUserRole();
  if (!user) {
    return {
      ok: false,
      error: E_UNAUTHORIZED,
      status: 401,
      profileRole: null,
    };
  }

  if (profileRole !== "admin") {
    return {
      ok: false,
      error: E_FORBIDDEN,
      status: 403,
      profileRole,
    };
  }

  return {
    ok: true,
    user,
    profileRole: "admin",
  };
}

export async function requireAdminRoleForApi(): Promise<AdminApiResult> {
  const result = await requireAdminRole();
  if (!result.ok) {
    return {
      user: null,
      response: apiError(result.error, result.status),
    };
  }

  return {
    user: result.user,
    response: null,
  };
}

export async function requireAdminOrOpsForApi(
  request: Request
): Promise<AdminOrOpsApiResult> {
  if (hasValidOpsHealthToken(request)) {
    return {
      access: "ops",
      user: null,
      response: null,
    };
  }

  const admin = await requireAdminRoleForApi();
  if (admin.response) {
    return {
      access: null,
      user: null,
      response: admin.response,
    };
  }

  return {
    access: "admin",
    user: admin.user,
    response: null,
  };
}

export async function hasAdminOrOpsAccess(request: Request): Promise<boolean> {
  if (hasValidOpsHealthToken(request)) return true;
  const result = await requireAdminRole();
  return result.ok;
}
