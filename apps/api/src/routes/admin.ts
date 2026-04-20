import type { FastifyPluginAsync } from "fastify";
import {
  adminTestRequestSchema,
  adminTestResponseSchema,
  adminContractsSchema,
  adminOverviewSchema,
  contractDocumentSchema,
  dashboardViewSchema,
  dashboardViewUpsertRequestSchema,
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
import { extractAdminToken, extractSessionToken, requireAdminSession } from "../utils/admin-auth.js";
import { buildAsyncApiDocument, buildContractsManifest, buildOpenApiDocument } from "../contracts.js";

const safeAdminTestPaths = new Set([
  "/health",
  "/v1/admin/overview",
  "/v1/admin/logs",
  "/v1/admin/audit",
  "/v1/admin/devices",
  "/v1/admin/jobs",
  "/v1/admin/quotas",
  "/v1/admin/contracts",
  "/v1/admin/contracts/openapi.json",
  "/v1/admin/contracts/asyncapi.json",
  "/v1/admin/telemetry",
  "/v1/connectors/configs",
  "/v1/connectors/runs",
  "/v1/service-tokens"
]);

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

  app.get("/v1/admin/dashboard-views", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const query = request.query as { workspaceId?: string } | undefined;
    const workspaceIds =
      adminSession.role === "workspace_admin"
        ? adminSession.workspaceIds
        : query?.workspaceId
          ? [query.workspaceId]
          : undefined;
    const sessionToken = extractSessionToken(request);
    const session = sessionToken ? await app.services.authService.getSession(sessionToken) : null;
    const views = await app.services.dashboardViewsService.listViews({
      ...(workspaceIds ? { workspaceIds } : {}),
      userId: session?.user.id ?? null
    });
    return views.map((view) => dashboardViewSchema.parse(view));
  });

  app.post("/v1/admin/dashboard-views", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const sessionToken = extractSessionToken(request);
    const session = sessionToken ? await app.services.authService.getSession(sessionToken) : null;
    const body = dashboardViewUpsertRequestSchema.parse(request.body);
    if (adminSession.role === "workspace_admin" && !adminSession.workspaceIds.includes(body.workspaceId)) {
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN_WORKSPACE",
          message: "Admin does not have access to that workspace"
        }
      });
    }

    const view = await app.services.dashboardViewsService.saveView({
      workspaceId: body.workspaceId,
      userId: session?.user.id ?? null,
      name: body.name,
      filters: body.filters
    });
    await app.services.auditService.record({
      action: "dashboard.view.save",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: body.workspaceId,
      userId: session?.user.id ?? null,
      resourceType: "dashboard_view",
      resourceId: view.id,
      metadata: {
        name: body.name
      }
    });
    return reply.code(201).send(dashboardViewSchema.parse(view));
  });

  app.delete("/v1/admin/dashboard-views/:id", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const sessionToken = extractSessionToken(request);
    const session = sessionToken ? await app.services.authService.getSession(sessionToken) : null;
    const id = (request.params as { id: string }).id;
    const deleted = await app.services.dashboardViewsService.deleteView({
      id,
      ...(adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {}),
      userId: session?.user.id ?? null
    });
    if (!deleted) {
      return reply.code(404).send({
        error: {
          code: "DASHBOARD_VIEW_NOT_FOUND",
          message: "Dashboard view was not found"
        }
      });
    }

    await app.services.auditService.record({
      action: "dashboard.view.delete",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: session?.user.id ?? null,
      resourceType: "dashboard_view",
      resourceId: id,
      metadata: {}
    });
    return { ok: true };
  });

  app.post("/v1/admin/test-console", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = adminTestRequestSchema.parse(request.body);
    if (!safeAdminTestPaths.has(body.path)) {
      return reply.code(400).send({
        error: {
          code: "TEST_CONSOLE_PATH_FORBIDDEN",
          message: "The requested path is not allowed in the admin test console"
        }
      });
    }

    const headers: Record<string, string> = {};
    const sessionToken = extractSessionToken(request);
    const adminToken = extractAdminToken(request);
    if (sessionToken) {
      headers["x-kori-session"] = sessionToken;
    } else if (adminToken) {
      headers["x-kori-admin-key"] = adminToken;
    }

    const internal = await app.inject({
      method: body.method,
      url: body.path,
      headers
    });

    let responseBody: unknown;
    try {
      responseBody = internal.json();
    } catch {
      responseBody = internal.body;
    }

    await app.services.auditService.record({
      action: "admin.test_console.run",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: null,
      userId: null,
      resourceType: "admin_test_console",
      resourceId: null,
      metadata: {
        method: body.method,
        path: body.path,
        statusCode: internal.statusCode
      }
    });

    return adminTestResponseSchema.parse({
      ok: internal.statusCode < 400,
      method: body.method,
      path: body.path,
      statusCode: internal.statusCode,
      body: responseBody
    });
  });
};

export default adminRoutes;
