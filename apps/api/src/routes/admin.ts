import type { FastifyPluginAsync } from "fastify";
import {
  adminContractsSchema,
  adminOverviewSchema,
  contractDocumentSchema,
  deviceAdminActionRequestSchema,
  deviceAdminActionResponseSchema,
  deviceLiveStateSchema,
  developerLogEventSchema,
  jobStatusSchema,
  provisioningCodeRequestSchema,
  provisioningCodeResponseSchema,
  quotaUsageSchema,
  telemetryOverviewSchema
} from "@kori/shared";
import { requireAdminSession } from "../utils/admin-auth.js";
import { buildAsyncApiDocument, buildContractsManifest, buildOpenApiDocument } from "../contracts.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/admin/overview", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const [deviceRegistry, deviceStates, logs, audit, spotify, database, redis] = await Promise.all([
      app.services.deviceRegistryService.listDevices(),
      app.services.observabilityService.listDeviceStates(),
      app.services.observabilityService.listLogs({ limit: 100 }),
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

    const query = request.query as
      | {
          limit?: string;
          level?: string;
          route?: string;
          workspaceId?: string;
          userId?: string;
          deviceId?: string;
          requestId?: string;
          integration?: string;
        }
      | undefined;
    const limit = Number(query?.limit ?? "100");
    const logs = await app.services.observabilityService.listLogs({
      limit: Number.isFinite(limit) ? limit : 100,
      ...(query?.level ? { level: query.level as "debug" | "info" | "warn" | "error" } : {}),
      ...(query?.route ? { route: query.route } : {}),
      ...(query?.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query?.userId ? { userId: query.userId } : {}),
      ...(query?.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query?.requestId ? { requestId: query.requestId } : {}),
      ...(query?.integration ? { integration: query.integration } : {})
    });
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

  app.post("/v1/admin/devices/:id/revoke", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const deviceId = (request.params as { id: string }).id;
    const body = deviceAdminActionRequestSchema.parse(request.body ?? {});
    const revoked = await app.services.deviceRegistryService.revokeDevice({
      deviceId,
      reason: body.reason ?? null
    });
    if (!revoked) {
      return reply.code(404).send({
        error: {
          code: "DEVICE_NOT_FOUND",
          message: "Device was not found"
        }
      });
    }

    await app.services.auditService.record({
      action: "device.revoke",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "device",
      resourceId: deviceId,
      metadata: {
        reason: body.reason ?? null
      }
    });

    return deviceAdminActionResponseSchema.parse({
      ok: true,
      deviceId,
      action: "revoke"
    });
  });

  app.post("/v1/admin/devices/:id/reprovision", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const deviceId = (request.params as { id: string }).id;
    const reprovisioned = await app.services.deviceRegistryService.reprovisionDevice({ deviceId });

    await app.services.auditService.record({
      action: "device.reprovision",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "device",
      resourceId: deviceId,
      metadata: {
        expiresAt: reprovisioned.expiresAt
      }
    });

    return deviceAdminActionResponseSchema.parse({
      ok: true,
      deviceId,
      action: "reprovision",
      deviceToken: reprovisioned.token,
      expiresAt: reprovisioned.expiresAt,
      rotatedAt: reprovisioned.rotatedAt
    });
  });

  app.post("/v1/admin/devices/:id/config", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const deviceId = (request.params as { id: string }).id;
    const body = deviceAdminActionRequestSchema.parse(request.body ?? {});
    const result = await app.services.deviceRegistryService.updateDeviceConfig({
      deviceId,
      ...(body.telemetryIntervalSec !== undefined ? { telemetryIntervalSec: body.telemetryIntervalSec } : {}),
      ...(body.thresholds !== undefined ? { thresholds: body.thresholds } : {}),
      ...(body.timerMethod !== undefined ? { timerMethod: body.timerMethod } : {})
    });

    await app.services.auditService.record({
      action: "device.config_update",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "device_config",
      resourceId: deviceId,
      metadata: {
        configVersion: result.version
      }
    });

    return deviceAdminActionResponseSchema.parse({
      ok: true,
      deviceId,
      action: "config_update",
      configVersion: result.version
    });
  });

  app.post("/v1/admin/devices/:id/mark-offline", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const deviceId = (request.params as { id: string }).id;
    const body = deviceAdminActionRequestSchema.parse(request.body ?? {});
    const marked = await app.services.deviceRegistryService.markDeviceOffline({
      deviceId,
      reason: body.reason ?? null
    });
    if (!marked) {
      return reply.code(404).send({
        error: {
          code: "DEVICE_NOT_FOUND",
          message: "Device was not found"
        }
      });
    }

    await app.services.auditService.record({
      action: "device.mark_offline",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "device",
      resourceId: deviceId,
      metadata: {
        reason: body.reason ?? null
      }
    });

    return deviceAdminActionResponseSchema.parse({
      ok: true,
      deviceId,
      action: "mark_offline"
    });
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

  app.get("/v1/admin/telemetry", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const query = request.query as { hours?: string; bucketMinutes?: string } | undefined;
    const hours = Number(query?.hours ?? "24");
    const bucketMinutes = Number(query?.bucketMinutes ?? "15");
    const overview = await app.services.telemetryService.getOverview({
      hours: Number.isFinite(hours) ? hours : 24,
      bucketMinutes: Number.isFinite(bucketMinutes) ? bucketMinutes : 15
    });

    return telemetryOverviewSchema.parse(overview);
  });

  app.post("/v1/admin/telemetry/enable-timescale", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const result = await app.services.telemetryService.enableTimescaleSupport();
    await app.services.auditService.record({
      action: "telemetry.timescale_enable_attempt",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "telemetry",
      resourceId: null,
      metadata: result
    });

    return result;
  });

  app.get("/v1/admin/contracts", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    return adminContractsSchema.parse(buildContractsManifest());
  });

  app.get("/v1/admin/contracts/openapi.json", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    return contractDocumentSchema.parse(buildOpenApiDocument());
  });

  app.get("/v1/admin/contracts/asyncapi.json", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    return contractDocumentSchema.parse(buildAsyncApiDocument());
  });

  app.get("/v1/admin/jobs", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const jobs = await app.services.jobsService.listJobs(100);
    return jobs.map((job) => jobStatusSchema.parse(job));
  });

  app.get("/v1/admin/quotas", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const usage = await app.services.quotasService.listUsage(
      adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {}
    );
    return usage.map((entry) => quotaUsageSchema.parse(entry));
  });
};

export default adminRoutes;
