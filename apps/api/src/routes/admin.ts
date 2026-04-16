import type { FastifyPluginAsync } from "fastify";
import {
  adminOverviewSchema,
  deviceLiveStateSchema,
  developerLogEventSchema,
  provisioningCodeRequestSchema,
  provisioningCodeResponseSchema
} from "@kori/shared";
import { requireAdminSession } from "../utils/admin-auth.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/admin/overview", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const [deviceRegistry, deviceStates, logs, audit, spotify, database, redis] = await Promise.all([
      app.services.deviceRegistryService.listDevices(),
      app.services.observabilityService.listDeviceStates(),
      app.services.observabilityService.listLogs(100),
      app.services.auditService.listRecent(100),
      app.services.observabilityService.listSpotifyPresence(),
      app.services.healthService.databaseHealth(),
      app.services.healthService.redisHealth()
    ]);

    return adminOverviewSchema.parse({
      generatedAt: new Date().toISOString(),
      counts: {
        devices: deviceRegistry.length,
        connectedDevices: deviceStates.filter((state) => state.connected).length,
        recentLogs: logs.length,
        recentAuditEvents: audit.length,
        spotifyConnections: spotify.length
      },
      services: {
        database,
        redis
      }
    });
  });

  app.get("/v1/admin/logs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const limit = Number((request.query as { limit?: string } | undefined)?.limit ?? "100");
    const logs = await app.services.observabilityService.listLogs(Number.isFinite(limit) ? limit : 100);
    return logs.map((log) => developerLogEventSchema.parse(log));
  });

  app.get("/v1/admin/audit", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const limit = Number((request.query as { limit?: string } | undefined)?.limit ?? "100");
    return app.services.auditService.listRecent(Number.isFinite(limit) ? limit : 100);
  });

  app.get("/v1/admin/devices", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const [registry, liveStates] = await Promise.all([
      app.services.deviceRegistryService.listDevices(),
      app.services.observabilityService.listDeviceStates()
    ]);
    const liveStateMap = new Map(liveStates.map((state) => [state.deviceId, state]));

    return registry.map((device) =>
      deviceLiveStateSchema.parse({
        deviceId: device.id,
        hardwareId: device.hardwareId,
        name: device.name,
        firmwareVersion: device.firmwareVersion,
        connected: liveStateMap.get(device.id)?.connected ?? false,
        connectedAt: liveStateMap.get(device.id)?.connectedAt ?? null,
        lastSeenAt: liveStateMap.get(device.id)?.lastSeenAt ?? device.lastSeenAt,
        lastServerTime: liveStateMap.get(device.id)?.lastServerTime ?? null,
        sensors: liveStateMap.get(device.id)?.sensors ?? null,
        health: liveStateMap.get(device.id)?.health ?? null,
        activeRuleTypes: liveStateMap.get(device.id)?.activeRuleTypes ?? []
      })
    );
  });

  app.post("/v1/admin/provisioning-codes", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = provisioningCodeRequestSchema.parse(request.body);
    const result = await app.services.provisioningCodeService.createCode({
      workspaceId: body.workspaceId,
      userId: body.userId,
      expiresInSec: body.expiresInSec,
      ...(body.label !== undefined ? { label: body.label } : {})
    });
    await app.services.auditService.record({
      action: "provisioning_code.created",
      actorType: adminSession.role === "platform_admin" || adminSession.role === "workspace_admin" ? "admin" : "user",
      actorId: adminSession.actorId,
      workspaceId: body.workspaceId,
      userId: body.userId,
      resourceType: "device_provisioning_code",
      resourceId: null,
      metadata: {
        expiresAt: result.expiresAt,
        label: result.label
      }
    });

    return reply.code(201).send(provisioningCodeResponseSchema.parse(result));
  });
};

export default adminRoutes;
