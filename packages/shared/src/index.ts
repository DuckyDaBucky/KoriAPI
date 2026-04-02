import { z } from "zod";

export const wsEventTypes = {
  deviceHello: "device:hello",
  deviceSensors: "device:sensors",
  deviceHealth: "device:health",
  deviceNotificationEvent: "device:notification_event",
  sessionReady: "session:ready",
  prefsUpdate: "prefs:update",
  notificationShow: "notification:show",
  recommendationShow: "recommendation:show",
  vibeSet: "vibe:set",
  spotifyState: "spotify:state",
  ping: "ping",
  pong: "pong",
  timeSync: "time:sync"
} as const;

export const deviceConfigSchema = z.object({
  telemetryIntervalSec: z.number().int().positive().default(2),
  thresholds: z.object({
    co2Ppm: z.number().int().positive().default(1000),
    noisePct: z.number().min(0).max(100).default(75),
    temperatureHighC: z.number().default(28),
    temperatureLowC: z.number().default(18)
  }).default({
    co2Ppm: 1000,
    noisePct: 75,
    temperatureHighC: 28,
    temperatureLowC: 18
  }),
  timerMethod: z.string().default("pomodoro")
});

export type DeviceConfig = z.infer<typeof deviceConfigSchema>;

export const bootstrapRequestSchema = z.object({
  hardwareId: z.string().min(2).max(64),
  userApiKey: z.string().min(8).max(128),
  deviceName: z.string().min(1).max(80),
  firmwareVersion: z.string().min(1).max(32)
});

export const bootstrapResponseSchema = z.object({
  deviceId: z.string(),
  deviceToken: z.string(),
  wsUrl: z.string().url(),
  config: deviceConfigSchema,
  serverTime: z.number().int().nonnegative()
});

const sensorPayloadSchema = z.object({
  deviceId: z.string().optional(),
  token: z.string().optional(),
  ts: z.number().int().optional(),
  sensors: z.object({
    temp: z.number().optional(),
    humidity: z.number().optional(),
    pressure: z.number().optional(),
    co2: z.number().int().optional(),
    tvoc: z.number().int().optional(),
    noise: z.number(),
    light: z.number()
  }),
  health: z.object({
    wifi: z.string(),
    bme280: z.string(),
    ccs811: z.string()
  })
});

const deviceHelloPayloadSchema = z.object({
  deviceId: z.string().optional(),
  token: z.string().optional(),
  firmwareVersion: z.string().min(1),
  hardwareId: z.string().min(2)
});

const deviceHealthPayloadSchema = z.object({
  deviceId: z.string().optional(),
  token: z.string().optional(),
  uptimeSec: z.number().int().nonnegative().optional(),
  freeHeap: z.number().int().nonnegative().optional(),
  wifiRssi: z.number().int().optional()
});

const deviceNotificationEventPayloadSchema = z.object({
  deviceId: z.string().optional(),
  token: z.string().optional(),
  notificationId: z.string().min(1),
  action: z.enum(["shown", "acknowledged", "dismissed"])
});

export const inboundEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(wsEventTypes.deviceHello),
    ts: z.number().int().optional(),
    payload: deviceHelloPayloadSchema
  }),
  z.object({
    type: z.literal(wsEventTypes.deviceSensors),
    ts: z.number().int().optional(),
    payload: sensorPayloadSchema
  }),
  z.object({
    type: z.literal(wsEventTypes.deviceHealth),
    ts: z.number().int().optional(),
    payload: deviceHealthPayloadSchema
  }),
  z.object({
    type: z.literal(wsEventTypes.deviceNotificationEvent),
    ts: z.number().int().optional(),
    payload: deviceNotificationEventPayloadSchema
  }),
  z.object({
    type: z.literal(wsEventTypes.pong),
    ts: z.number().int().optional(),
    payload: z.object({}).passthrough().optional().default({})
  })
]);

export type InboundEnvelope = z.infer<typeof inboundEnvelopeSchema>;

export const outboundEnvelopeSchema = z.object({
  type: z.enum([
    wsEventTypes.sessionReady,
    wsEventTypes.prefsUpdate,
    wsEventTypes.notificationShow,
    wsEventTypes.recommendationShow,
    wsEventTypes.vibeSet,
    wsEventTypes.spotifyState,
    wsEventTypes.ping,
    wsEventTypes.timeSync
  ]),
  ts: z.number().int(),
  payload: z.record(z.string(), z.unknown())
});

export type OutboundEnvelope = z.infer<typeof outboundEnvelopeSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  time: z.string(),
  services: z.object({
    database: z.enum(["up", "down"]),
    redis: z.enum(["up", "down"])
  })
});

export const notificationSeveritySchema = z.enum(["low", "medium", "high"]);

export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
