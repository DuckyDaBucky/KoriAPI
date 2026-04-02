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
    connectedAt: new Date().toISOString()
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
          socket.close(4001, "unauthorized");
          return;
        }

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
      }
    } catch (error) {
      app.log.warn({ error }, "failed to process device websocket message");
      socket.close(1003, "bad payload");
    }
  });

  socket.on("close", async () => {
    if (session.device) {
      await app.services.liveStateService.removeDeviceSession(session.device.id);
    }
  });
}
