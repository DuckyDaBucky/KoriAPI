import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../config/env.js";
import { safeTokenCompare } from "./crypto.js";

export function extractAdminToken(request: FastifyRequest): string | null {
  const headerValue = request.headers["x-kori-admin-key"];
  const directHeader = typeof headerValue === "string" ? headerValue : Array.isArray(headerValue) ? headerValue[0] : null;
  if (directHeader) {
    return directHeader;
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const queryValue = (request.query as Record<string, unknown> | undefined)?.adminToken;
  return typeof queryValue === "string" ? queryValue : null;
}

export function isAdminAuthorized(token: string | null, env: AppEnv): boolean {
  return token !== null && safeTokenCompare(token, env.ADMIN_API_KEY);
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = extractAdminToken(request);
  if (isAdminAuthorized(token, request.server.config)) {
    return true;
  }

  reply.code(401).send({
    error: {
      code: "UNAUTHORIZED_ADMIN",
      message: "Valid admin credentials are required"
    }
  });
  return false;
}
