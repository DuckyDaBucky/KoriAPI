import type { FastifyPluginAsync } from "fastify";
import {
  connectorConfigRequestSchema,
  connectorConfigSchema,
  connectorRunRequestSchema,
  connectorRunSchema
} from "@kori/shared";
import { ensureAdminWorkspaceAccess, requireAdminSession } from "../utils/admin-auth.js";

const connectorsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/connectors/configs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const configs = await app.services.connectorsService.listConfigs(
      adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {}
    );
    return configs.map((config) => connectorConfigSchema.parse(config));
  });

  app.post("/v1/connectors/configs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = connectorConfigRequestSchema.parse(request.body);
    if (!ensureAdminWorkspaceAccess(adminSession, body.workspaceId, reply)) {
      return;
    }

    const config = await app.services.connectorsService.upsertConfig(body);
    await app.services.auditService.record({
      action: "connector.config.upsert",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: body.workspaceId,
      userId: null,
      resourceType: "connector_config",
      resourceId: config.id,
      metadata: {
        provider: body.provider
      }
    });

    return connectorConfigSchema.parse(config);
  });

  app.get("/v1/connectors/runs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const runs = await app.services.connectorsService.listRuns({
      limit: 100,
      ...(adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {})
    });
    return runs.map((run) => connectorRunSchema.parse(run));
  });

  app.post("/v1/connectors/runs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = connectorRunRequestSchema.parse(request.body);
    if (!ensureAdminWorkspaceAccess(adminSession, body.workspaceId, reply)) {
      return;
    }

    const run = await app.services.connectorsService.triggerRun({
      workspaceId: body.workspaceId,
      provider: body.provider,
      triggeredBy: adminSession.actorId
    });
    await app.services.auditService.record({
      action: "connector.run.trigger",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: body.workspaceId,
      userId: null,
      resourceType: "connector_run",
      resourceId: run.id,
      metadata: {
        provider: body.provider
      }
    });

    return reply.code(201).send(connectorRunSchema.parse(run));
  });
};

export default connectorsRoutes;
