import type { FastifyPluginAsync } from "fastify";
import {
  authLoginRequestSchema,
  authRegisterRequestSchema,
  authSessionResponseSchema
} from "@kori/shared";
import { extractSessionToken, requireUserSession } from "../utils/admin-auth.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/auth/register", async (request, reply) => {
    const body = authRegisterRequestSchema.parse(request.body);

    try {
      const session = await app.services.authService.register({
        email: body.email,
        password: body.password,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.workspaceName !== undefined ? { workspaceName: body.workspaceName } : {})
      });

      await app.services.auditService.record({
        action: "auth.register",
        actorType: "user",
        actorId: session.user.id,
        workspaceId: session.user.workspaces[0]?.id ?? null,
        userId: session.user.id,
        resourceType: "user",
        resourceId: session.user.id,
        metadata: {
          email: session.user.email
        }
      });

      return reply.code(201).send(authSessionResponseSchema.parse(session));
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
        return reply.code(409).send({
          error: {
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with that email already exists"
          }
        });
      }

      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = authLoginRequestSchema.parse(request.body);
    const session = await app.services.authService.login(body);

    if (!session) {
      return reply.code(401).send({
        error: {
          code: "INVALID_LOGIN",
          message: "Email or password is incorrect"
        }
      });
    }

    await app.services.auditService.record({
      action: "auth.login",
      actorType: "user",
      actorId: session.user.id,
      workspaceId: session.user.workspaces[0]?.id ?? null,
      userId: session.user.id,
      resourceType: "session",
      resourceId: null,
      metadata: {}
    });

    return authSessionResponseSchema.parse(session);
  });

  app.get("/v1/auth/session", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    return authSessionResponseSchema.parse(session);
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      return reply.code(401).send({
        error: {
          code: "MISSING_SESSION",
          message: "Session token is required"
        }
      });
    }

    const session = await app.services.authService.getSession(token);
    await app.services.authService.logout(token);

    if (session) {
      await app.services.auditService.record({
        action: "auth.logout",
        actorType: "user",
        actorId: session.user.id,
        workspaceId: session.user.workspaces[0]?.id ?? null,
        userId: session.user.id,
        resourceType: "session",
        resourceId: null,
        metadata: {}
      });
    }

    return { ok: true };
  });
};

export default authRoutes;
