import type { FastifyPluginAsync } from "fastify";
import {
  serviceTokenCreateRequestSchema,
  serviceTokenCreateResponseSchema,
  serviceTokenSchema
} from "@kori/shared";
import { ensureAdminWorkspaceAccess, requireAdminSession } from "../utils/admin-auth.js";

const serviceTokenRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/service-tokens", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const tokens = await app.services.securityService.listServiceTokens(
      adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {}
    );
    return tokens.map((token) => serviceTokenSchema.parse(token));
  });

  app.post("/v1/service-tokens", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = serviceTokenCreateRequestSchema.parse(request.body);
    if (body.workspaceId && !ensureAdminWorkspaceAccess(adminSession, body.workspaceId, reply)) {
      return;
    }

    const token = await app.services.securityService.createServiceToken({
      label: body.label,
      ...(body.workspaceId !== undefined ? { workspaceId: body.workspaceId } : {})
    });
    await app.services.auditService.record({
      action: "service_token.create",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: token.serviceToken.workspaceId,
      userId: null,
      resourceType: "service_token",
      resourceId: token.serviceToken.id,
      metadata: {
        label: token.serviceToken.label
      }
    });

    return reply.code(201).send(serviceTokenCreateResponseSchema.parse(token));
  });

  app.delete("/v1/service-tokens/:id", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const tokenId = (request.params as { id: string }).id;
    const revoked = await app.services.securityService.revokeServiceToken(tokenId);
    if (!revoked) {
      return reply.code(404).send({
        error: {
          code: "SERVICE_TOKEN_NOT_FOUND",
          message: "Service token was not found"
        }
      });
    }

    await app.services.auditService.record({
      action: "service_token.revoke",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "service_token",
      resourceId: tokenId,
      metadata: {}
    });

    return { ok: true };
  });
};

export default serviceTokenRoutes;
