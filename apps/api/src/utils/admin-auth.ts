import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../config/env.js";
import { safeTokenCompare } from "./crypto.js";
import type { AdminSession, AuthSession } from "../services/types.js";

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

export function extractSessionToken(request: FastifyRequest): string | null {
  const headerValue = request.headers["x-kori-session"];
  if (typeof headerValue === "string") {
    return headerValue;
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Session ")) {
    return authorization.slice("Session ".length).trim();
  }

  const queryValue = (request.query as Record<string, unknown> | undefined)?.sessionToken;
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

export async function requireAdminSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AdminSession | null> {
  const token = extractAdminToken(request);
  if (isAdminAuthorized(token, request.server.config)) {
    return {
      role: "platform_admin",
      actorId: "admin_api_key",
      workspaceIds: []
    };
  }

  const sessionToken = extractSessionToken(request);
  if (!sessionToken) {
    reply.code(401).send({
      error: {
        code: "UNAUTHORIZED_ADMIN",
        message: "Admin session or admin key is required"
      }
    });
    return null;
  }

  const session = await request.server.services.authService.getSession(sessionToken);
  if (!session) {
    reply.code(401).send({
      error: {
        code: "INVALID_SESSION",
        message: "Session is invalid or expired"
      }
    });
    return null;
  }

  const role = session.user.roles.find((value) => value === "platform_admin" || value === "workspace_admin");
  if (!role) {
    reply.code(403).send({
      error: {
        code: "FORBIDDEN_ADMIN",
        message: "Admin role is required"
      }
    });
    return null;
  }

  return {
    role,
    actorId: session.user.id,
    workspaceIds: session.user.workspaces.map((workspace) => workspace.id)
  };
}

export function ensureAdminWorkspaceAccess(
  adminSession: AdminSession,
  workspaceId: string,
  reply: FastifyReply
): boolean {
  if (adminSession.role === "platform_admin" || adminSession.actorId === "admin_api_key") {
    return true;
  }

  if (adminSession.workspaceIds.includes(workspaceId)) {
    return true;
  }

  reply.code(403).send({
    error: {
      code: "FORBIDDEN_WORKSPACE",
      message: "Admin does not have access to that workspace"
    }
  });
  return false;
}

export async function requireUserSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthSession | null> {
  const sessionToken = extractSessionToken(request);
  if (!sessionToken) {
    reply.code(401).send({
      error: {
        code: "MISSING_SESSION",
        message: "Session token is required"
      }
    });
    return null;
  }

  const session = await request.server.services.authService.getSession(sessionToken);
  if (!session) {
    reply.code(401).send({
      error: {
        code: "INVALID_SESSION",
        message: "Session is invalid or expired"
      }
    });
    return null;
  }

  return session;
}
