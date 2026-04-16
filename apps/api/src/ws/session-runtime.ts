import { URL } from "node:url";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { wsEventTypes } from "@kori/shared";
import { extractAdminToken, extractSessionToken, isAdminAuthorized } from "../utils/admin-auth.js";
import type { AdminStreamEvent } from "../services/types.js";

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function send(socket: WebSocket, type: string, payload: Record<string, unknown>): void {
  socket.send(
    JSON.stringify({
      type,
      ts: nowUnix(),
      payload
    })
  );
}

function toWsEventType(event: AdminStreamEvent["type"]): string {
  switch (event) {
    case "admin:log":
      return wsEventTypes.adminLog;
    case "admin:device_state":
      return wsEventTypes.adminDeviceState;
    case "admin:audit":
      return wsEventTypes.adminAudit;
    case "admin:spotify_presence":
      return wsEventTypes.adminSpotifyPresence;
    case "admin:overview":
      return wsEventTypes.adminOverview;
  }
}

export async function attachSessionSocket(
  app: FastifyInstance,
  socket: WebSocket,
  request: {
    headers: Record<string, string | string[] | undefined>;
    url: string;
  }
): Promise<void> {
  const parsedUrl = new URL(request.url, "http://localhost");
  const queryToken = parsedUrl.searchParams.get("adminToken");
  const querySession = parsedUrl.searchParams.get("sessionToken");
  const token = extractAdminToken({
    headers: request.headers,
    query: {
      adminToken: queryToken
    }
  } as never);

  if (!isAdminAuthorized(token, app.config)) {
    const sessionToken = extractSessionToken({
      headers: request.headers,
      query: { sessionToken: querySession }
    } as never);
    const session = sessionToken ? await app.services.authService.getSession(sessionToken) : null;
    const hasAdminRole = Boolean(
      session?.user.roles.some((role) => role === "platform_admin" || role === "workspace_admin")
    );

    if (!hasAdminRole) {
      socket.close(4001, "unauthorized");
      return;
    }
  }

  const [recentLogs, deviceStates, spotifyPresence, auditEvents, health] = await Promise.all([
    app.services.observabilityService.listLogs(50),
    app.services.observabilityService.listDeviceStates(),
    app.services.observabilityService.listSpotifyPresence(),
    app.services.auditService.listRecent(50),
    Promise.all([
      app.services.healthService.databaseHealth(),
      app.services.healthService.redisHealth()
    ])
  ]);

  send(socket, wsEventTypes.adminReady, {
    stream: "admin",
    serverTime: nowUnix()
  });

  send(socket, wsEventTypes.adminOverview, {
    generatedAt: new Date().toISOString(),
    counts: {
      devices: deviceStates.length,
      connectedDevices: deviceStates.filter((device) => device.connected).length,
      recentLogs: recentLogs.length,
      recentAuditEvents: auditEvents.length,
      spotifyConnections: spotifyPresence.length
    },
    services: {
      database: health[0],
      redis: health[1]
    }
  });

  for (const logEvent of recentLogs.reverse()) {
    send(socket, wsEventTypes.adminLog, logEvent as unknown as Record<string, unknown>);
  }

  for (const deviceState of deviceStates.reverse()) {
    send(socket, wsEventTypes.adminDeviceState, deviceState as unknown as Record<string, unknown>);
  }

  for (const auditEvent of auditEvents.reverse()) {
    send(socket, wsEventTypes.adminAudit, auditEvent as unknown as Record<string, unknown>);
  }

  for (const presence of spotifyPresence.reverse()) {
    send(socket, wsEventTypes.adminSpotifyPresence, presence as unknown as Record<string, unknown>);
  }

  const unsubscribe = app.services.observabilityService.subscribe((event) => {
    send(socket, toWsEventType(event.type), event.payload as Record<string, unknown>);
  });

  socket.on("close", () => {
    unsubscribe();
  });
}
