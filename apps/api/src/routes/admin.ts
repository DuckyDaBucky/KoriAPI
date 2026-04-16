import type { FastifyPluginAsync } from "fastify";
import {
  adminContractsSchema,
  adminOverviewSchema,
  deviceLiveStateSchema,
  developerLogEventSchema,
  provisioningCodeRequestSchema,
  provisioningCodeResponseSchema,
  telemetryOverviewSchema,
  wsEventTypes
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

    return adminContractsSchema.parse({
      generatedAt: new Date().toISOString(),
      rest: [
        {
          method: "GET",
          path: "/health",
          auth: "public",
          summary: "Service health for database and Redis"
        },
        {
          method: "POST",
          path: "/v1/auth/login",
          auth: "public",
          summary: "Create a human session token"
        },
        {
          method: "GET",
          path: "/v1/workspaces",
          auth: "session",
          summary: "List workspaces available to the signed-in user"
        },
        {
          method: "POST",
          path: "/v1/device/bootstrap",
          auth: "public",
          summary: "Provision a device via provisioning code or legacy API key"
        },
        {
          method: "GET",
          path: "/v1/device/config",
          auth: "device",
          summary: "Fetch the active device-safe configuration payload"
        },
        {
          method: "POST",
          path: "/v1/device/token/rotate",
          auth: "device",
          summary: "Rotate the active device token"
        },
        {
          method: "GET",
          path: "/v1/notes",
          auth: "session",
          summary: "List notes visible to the current user"
        },
        {
          method: "PATCH",
          path: "/v1/notes/:noteId",
          auth: "session",
          summary: "Update note title, type, or content and append a revision when content changes"
        },
        {
          method: "GET",
          path: "/v1/deadlines",
          auth: "session",
          summary: "List workspace deadlines visible to the current user"
        },
        {
          method: "PATCH",
          path: "/v1/deadlines/:deadlineId",
          auth: "session",
          summary: "Update due date, metadata, or deadline status"
        },
        {
          method: "GET",
          path: "/v1/recommendations",
          auth: "session",
          summary: "List user or workspace recommendations"
        },
        {
          method: "PATCH",
          path: "/v1/recommendations/:recommendationId",
          auth: "session",
          summary: "Update recommendation fields or mark delivery state"
        },
        {
          method: "GET",
          path: "/v1/admin/overview",
          auth: "admin",
          summary: "Top-level operational health and counts"
        },
        {
          method: "GET",
          path: "/v1/admin/logs",
          auth: "admin",
          summary: "Filtered structured log stream for operator analysis"
        },
        {
          method: "GET",
          path: "/v1/admin/contracts",
          auth: "admin",
          summary: "Manual contract/debug manifest for dashboard iteration"
        },
        {
          method: "POST",
          path: "/v1/integrations/spotify/presence",
          auth: "admin",
          summary: "Refresh sanitized Spotify presence for a linked user"
        }
      ],
      websocket: {
        devicePath: "/v1/ws/device",
        sessionPath: "/v1/ws/session",
        inboundTypes: [
          wsEventTypes.deviceHello,
          wsEventTypes.deviceSensors,
          wsEventTypes.deviceHealth,
          wsEventTypes.deviceNotificationEvent,
          wsEventTypes.pong
        ],
        outboundTypes: [
          wsEventTypes.sessionReady,
          wsEventTypes.adminReady,
          wsEventTypes.adminLog,
          wsEventTypes.adminDeviceState,
          wsEventTypes.adminAudit,
          wsEventTypes.adminSpotifyPresence,
          wsEventTypes.adminOverview,
          wsEventTypes.notificationShow,
          wsEventTypes.recommendationShow,
          wsEventTypes.spotifyState,
          wsEventTypes.timeSync,
          wsEventTypes.ping
        ]
      },
      sharedSchemas: [
        "Workspace",
        "AuthUser",
        "DeviceConfig",
        "ProvisioningCode",
        "Note",
        "NoteRevision",
        "Deadline",
        "Recommendation",
        "TelemetryBucket",
        "TelemetryLatest",
        "DeveloperLogEvent",
        "DeviceLiveState",
        "SpotifyPresence",
        "ErrorEnvelope"
      ]
    });
  });
};

export default adminRoutes;
