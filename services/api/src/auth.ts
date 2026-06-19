import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { OwnerRole } from "@dip/core";

/**
 * Resolve the acting user's role + email. In production, verify a Supabase
 * HS256 JWT (no external dep). For local/dev, fall back to x-dip-role /
 * x-dip-email headers. The GM role sees every recommendation; other roles are
 * scoped to their own slice (enforced in the worklist route).
 */
export interface Actor {
  role: OwnerRole | null;
  email: string | null;
}

const ROLES: OwnerRole[] = [
  "gm", "used_car_mgr", "new_car_mgr", "sales_mgr",
  "bdc_mgr", "inventory_mgr", "finance_mgr", "marketing_mgr",
];

function asRole(value: unknown): OwnerRole | null {
  return typeof value === "string" && (ROLES as string[]).includes(value)
    ? (value as OwnerRole)
    : null;
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  const sig = Buffer.from(s);
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload["exp"] === "number" && Date.now() / 1000 > payload["exp"]) return null;
    return payload;
  } catch {
    return null;
  }
}

export function resolveActor(request: FastifyRequest, jwtSecret: string): Actor {
  const auth = request.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const payload = verifyJwt(auth.slice("Bearer ".length), jwtSecret);
    if (payload) {
      const appMeta = payload["app_metadata"] as Record<string, unknown> | undefined;
      const userMeta = payload["user_metadata"] as Record<string, unknown> | undefined;
      return {
        role: asRole(payload["role"] ?? appMeta?.["role"] ?? userMeta?.["role"]),
        email: typeof payload["email"] === "string" ? (payload["email"] as string) : null,
      };
    }
  }
  // Dev fallback.
  return {
    role: asRole(request.headers["x-dip-role"]),
    email:
      typeof request.headers["x-dip-email"] === "string"
        ? (request.headers["x-dip-email"] as string)
        : null,
  };
}

/**
 * The role whose worklist the request may see. A non-GM authenticated actor is
 * pinned to their own role; otherwise the requested role filter (if any) is used.
 */
export function effectiveRole(
  actor: Actor,
  requested: OwnerRole | undefined,
): OwnerRole | undefined {
  if (actor.role && actor.role !== "gm") return actor.role;
  return requested;
}
