import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { inboundEnvelopeSchema, wsEventTypes } from "@kori/shared";
import type { AuthenticatedDevice } from "../services/types.js";

interface DeviceSession {
  socket: WebSocket;
  device: AuthenticatedDevice | null;
  token: string | null;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function nowIso(): string {
  return new Date().toISOString();
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

function getBearerToken(value?: string): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim() || null;
}

function activeRuleSetFromState(state: Record<string, unknown> | null): Set<string> {
  const raw = state?.activeRuleTypes;
  if (!Array.isArray(raw)) {
    return new Set<string>();
  }

  return new Set(
    raw.filter((value): value is string => typeof value === "string")
  );
}

function activeRuleListFromState(state: Record<string, unknown> | null): string[] {
  return [...activeRuleSetFromState(state)];
}

function toSensorInput(sensors: {
  noise: number;
  light: number;
  temp?: number | undefined;
  humidity?: number | undefined;
  pressure?: number | undefined;
  co2?: number | undefined;
  tvoc?: number | undefined;
}): {
  noise: number;
  light: number;
  temp?: number;
  humidity?: number;
  pressure?: number;
  co2?: number;
  tvoc?: number;
} {
  return {
    noise: sensors.noise,
    light: sensors.light,
    ...(sensors.temp !== undefined ? { temp: sensors.temp } : {}),
    ...(sensors.humidity !== undefined ? { humidity: sensors.humidity } : {}),
    ...(sensors.pressure !== undefined ? { pressure: sensors.pressure } : {}),
    ...(sensors.co2 !== undefined ? { co2: sensors.co2 } : {}),
    ...(sensors.tvoc !== undefined ? { tvoc: sensors.tvoc } : {})
  };
}

async function publishDeviceState(
  app: FastifyInstance,
  device: AuthenticatedDevice,
  state: {
    connected: boolean;
    connectedAt?: string | null;
    lastSeenAt?: string | null;
    lastServerTime?: number | null;
    sensors?: Record<string, unknown> | null;
    health?: Record<string, unknown> | null;
    activeRuleTypes?: string[];
  }
): Promise<void> {
  const registry = await app.services.deviceRegistryService.listDevices();
  const details = registry.find((entry) => entry.id === device.id);
  await app.services.observabilityService.setDeviceState({
    deviceId: device.id,
    hardwareId: details?.hardwareId ?? null,
    name: details?.name ?? null,
    firmwareVersion: details?.firmwareVersion ?? null,
    connected: state.connected,
    connectedAt: state.connectedAt ?? null,
    lastSeenAt: state.lastSeenAt ?? null,
    lastServerTime: state.lastServerTime ?? null,
    sensors: state.sensors ?? null,
    health: state.health ?? null,
    activeRuleTypes: state.activeRuleTypes ?? []
  });
}

async function authenticateSession(
  app: FastifyInstance,
  session: DeviceSession,
  payloadToken?: string,
  payloadDeviceId?: string
): Promise<AuthenticatedDevice | null> {
  const token = payloadToken ?? session.token;
  if (!token) {
    return null;
  }

  const device = await app.services.deviceAuthService.authenticateToken(token);
  if (!device) {
    return null;
  }

  if (payloadDeviceId && payloadDeviceId !== device.id) {
    return null;
  }

  session.device = device;
  await app.services.liveStateService.setDeviceSession(device.id, {
    connectedAt: nowIso()
  });
  await publishDeviceState(app, device, {
    connected: true,
    connectedAt: nowIso(),
    lastSeenAt: nowIso(),
    lastServerTime: nowUnix()
  });

  send(session.socket, wsEventTypes.sessionReady, {
    deviceId: device.id,
    serverTime: nowUnix()
  });

  send(session.socket, wsEventTypes.timeSync, {
    serverTime: nowUnix(),
    reason: "connect"
  });

  return device;
}

export async function attachDeviceSocket(
  app: FastifyInstance,
  socket: WebSocket,
  request: { headers: Record<string, string | string[] | undefined> }
): Promise<void> {
  const authorization = request.headers.authorization;
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  const session: DeviceSession = {
    socket,
    device: null,
    token: getBearerToken(headerValue)
  };

  socket.on("message", async (raw: Buffer) => {
    try {
      const parsed = inboundEnvelopeSchema.parse(JSON.parse(raw.toString()));

      if (parsed.type === wsEventTypes.deviceHello) {
        const device = await authenticateSession(
          app,
          session,
          parsed.payload.token,
          parsed.payload.deviceId
        );

        if (!device) {
          await app.services.observabilityService.log({
            level: "warn",
            message: "Device WebSocket authentication failed",
            route: "/v1/ws/device",
            method: "GET",
            requestId: null,
            statusCode: 401,
            workspaceId: null,
            userId: null,
            deviceId: parsed.payload.deviceId ?? null,
            integration: null,
            metadata: {}
          });
          socket.close(4001, "unauthorized");
          return;
        }

        await app.services.auditService.record({
          action: "device.socket_connected",
          actorType: "device",
          actorId: device.id,
          workspaceId: device.workspaceId,
          userId: device.userId,
          resourceType: "device",
          resourceId: device.id,
          metadata: {}
        });
        return;
      }

      if (!session.device) {
        const device = await authenticateSession(app, session);
        if (!device) {
          socket.close(4001, "unauthorized");
          return;
        }
      }

      const device = session.device;
      if (!device) {
        socket.close(4001, "unauthorized");
        return;
      }

      if (parsed.type === wsEventTypes.deviceSensors) {
        const previousState = await app.services.liveStateService.getDeviceState(device.id);
        const result = await app.services.sensorIngestionService.ingest({
          device,
          ...(parsed.payload.ts !== undefined ? { eventTs: parsed.payload.ts } : {}),
          sensors: toSensorInput(parsed.payload.sensors),
          health: parsed.payload.health
        });
        const previousRules = activeRuleSetFromState(previousState);
        const activeRuleTypes = result.notifications.map((notification) => notification.type);

        await app.services.liveStateService.setDeviceState(device.id, {
          receivedAt: result.receivedAt,
          sensors: parsed.payload.sensors,
          health: parsed.payload.health,
          activeRuleTypes
        });
        await publishDeviceState(app, device, {
          connected: true,
          connectedAt: nowIso(),
          lastSeenAt: nowIso(),
          lastServerTime: result.receivedAt,
          sensors: parsed.payload.sensors,
          health: parsed.payload.health,
          activeRuleTypes
        });

        for (const notification of result.notifications) {
          if (previousRules.has(notification.type)) {
            continue;
          }

          send(socket, wsEventTypes.notificationShow, {
            id: `${device.id}:${notification.type}:${result.receivedAt}`,
            title: notification.title,
            body: notification.body,
            severity: notification.severity,
            mood: notification.severity === "high" ? "concerned" : "idle"
          });
        }

        return;
      }

      if (parsed.type === wsEventTypes.deviceNotificationEvent) {
        await app.services.notificationEventService.recordEvent({
          deviceId: device.id,
          notificationId: parsed.payload.notificationId,
          action: parsed.payload.action
        });
        await app.services.auditService.record({
          action: `device.notification_${parsed.payload.action}`,
          actorType: "device",
          actorId: device.id,
          workspaceId: device.workspaceId,
          userId: device.userId,
          resourceType: "notification",
          resourceId: parsed.payload.notificationId,
          metadata: {}
        });
        return;
      }

      if (parsed.type === wsEventTypes.pong) {
        return;
      }

      if (parsed.type === wsEventTypes.deviceHealth) {
        const previousState = await app.services.liveStateService.getDeviceState(device.id);
        await app.services.liveStateService.setDeviceState(device.id, {
          lastHealth: parsed.payload,
          receivedAt: nowUnix(),
          activeRuleTypes: activeRuleListFromState(previousState)
        });
        await publishDeviceState(app, device, {
          connected: true,
          connectedAt: nowIso(),
          lastSeenAt: nowIso(),
          lastServerTime: nowUnix(),
          health: parsed.payload,
          activeRuleTypes: activeRuleListFromState(previousState)
        });
      }
    } catch (error) {
      await app.services.observabilityService.log({
        level: "warn",
        message: "Failed to process device WebSocket message",
        route: "/v1/ws/device",
        method: "GET",
        requestId: null,
        statusCode: 1003,
        workspaceId: session.device?.workspaceId ?? null,
        userId: session.device?.userId ?? null,
        deviceId: session.device?.id ?? null,
        integration: null,
        metadata: {
          error: error instanceof Error ? error.message : "unknown_error"
        }
      });
      app.log.warn({ error }, "failed to process device websocket message");
      socket.close(1003, "bad payload");
    }
  });

  socket.on("close", async () => {
    if (session.device) {
      await app.services.liveStateService.removeDeviceSession(session.device.id);
      await app.services.observabilityService.removeDeviceState(session.device.id);
      await app.services.auditService.record({
        action: "device.socket_disconnected",
        actorType: "device",
        actorId: session.device.id,
        workspaceId: session.device.workspaceId,
        userId: session.device.userId,
        resourceType: "device",
        resourceId: session.device.id,
        metadata: {}
      });
    }
  });
}
