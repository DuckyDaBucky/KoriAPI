import { z } from "zod";

export const wsEventTypes = {
  deviceHello: "device:hello",
  deviceSensors: "device:sensors",
  deviceHealth: "device:health",
  deviceNotificationEvent: "device:notification_event",
  sessionReady: "session:ready",
  adminReady: "admin:ready",
  adminLog: "admin:log",
  adminDeviceState: "admin:device_state",
  adminAudit: "admin:audit",
  adminSpotifyPresence: "admin:spotify_presence",
  adminOverview: "admin:overview",
  prefsUpdate: "prefs:update",
  notificationShow: "notification:show",
  recommendationShow: "recommendation:show",
  vibeSet: "vibe:set",
  spotifyState: "spotify:state",
  ping: "ping",
  pong: "pong",
  timeSync: "time:sync"
} as const;

export const workspaceRoleSchema = z.enum([
  "platform_admin",
  "workspace_admin",
  "member",
  "device",
  "service"
]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  roles: z.array(workspaceRoleSchema),
  workspaces: z.array(workspaceSchema)
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  name: z.string().min(1).max(120).optional(),
  workspaceName: z.string().min(1).max(160).optional()
});

export const authLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
});

export const authSessionResponseSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.string().datetime(),
  user: authUserSchema
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(["markdown", "txt", "latex", "mermaid", "drawing"]),
  content: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Note = z.infer<typeof noteSchema>;

export const noteRevisionSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  content: z.string(),
  userId: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type NoteRevision = z.infer<typeof noteRevisionSchema>;

export const noteCreateRequestSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  type: z.enum(["markdown", "txt", "latex", "mermaid", "drawing"]),
  content: z.string().default("")
});

export const noteRevisionCreateRequestSchema = z.object({
  content: z.string()
});

export const deadlineSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  title: z.string(),
  dueAt: z.string().datetime(),
  status: z.enum(["OPEN", "COMPLETED", "MISSED"]),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});
export type Deadline = z.infer<typeof deadlineSchema>;

export const deadlineCreateRequestSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  dueAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const recommendationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable()
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const recommendationCreateRequestSchema = z.object({
  workspaceId: z.string(),
  userId: z.string().optional(),
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  body: z.string().min(1)
});

export const telemetryBucketSchema = z.object({
  bucketStart: z.string().datetime(),
  sampleCount: z.number().int().nonnegative(),
  avgNoisePct: z.number().nullable(),
  avgLightPct: z.number().nullable(),
  avgTemperatureC: z.number().nullable(),
  avgCo2Ppm: z.number().nullable()
});
export type TelemetryBucket = z.infer<typeof telemetryBucketSchema>;

export const telemetryLatestSchema = z.object({
  deviceId: z.string(),
  receivedAt: z.string().datetime(),
  temperatureC: z.number().nullable(),
  humidityPct: z.number().nullable(),
  pressureHpa: z.number().nullable(),
  co2Ppm: z.number().nullable(),
  tvocPpb: z.number().nullable(),
  noisePct: z.number(),
  lightPct: z.number()
});
export type TelemetryLatest = z.infer<typeof telemetryLatestSchema>;

export const telemetryOverviewSchema = z.object({
  buckets: z.array(telemetryBucketSchema),
  latest: z.array(telemetryLatestSchema)
});

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
  userApiKey: z.string().min(8).max(128).optional(),
  provisioningCode: z.string().min(8).max(128).optional(),
  deviceName: z.string().min(1).max(80),
  firmwareVersion: z.string().min(1).max(32)
}).superRefine((value, ctx) => {
  if (!value.userApiKey && !value.provisioningCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either userApiKey or provisioningCode is required",
      path: ["userApiKey"]
    });
  }
});

export const bootstrapResponseSchema = z.object({
  deviceId: z.string(),
  deviceToken: z.string(),
  wsUrl: z.string().url(),
  config: deviceConfigSchema,
  serverTime: z.number().int().nonnegative(),
  protocolVersion: z.string().default("2026-04-16")
});

export const provisioningCodeRequestSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  expiresInSec: z.number().int().positive().max(3600).default(600),
  label: z.string().min(1).max(120).optional()
});

export const provisioningCodeResponseSchema = z.object({
  code: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  expiresAt: z.string().datetime(),
  label: z.string().nullable().default(null)
});

export const deviceTokenRotateResponseSchema = z.object({
  deviceToken: z.string(),
  expiresAt: z.string().datetime(),
  rotatedAt: z.string().datetime()
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
    wsEventTypes.adminReady,
    wsEventTypes.adminLog,
    wsEventTypes.adminDeviceState,
    wsEventTypes.adminAudit,
    wsEventTypes.adminSpotifyPresence,
    wsEventTypes.adminOverview,
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

export const spotifyPresenceSchema = z.object({
  userId: z.string(),
  isPlaying: z.boolean(),
  trackId: z.string().nullable(),
  trackName: z.string().nullable(),
  artistNames: z.array(z.string()),
  albumName: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  progressMs: z.number().int().nonnegative().nullable(),
  deviceName: z.string().nullable(),
  observedAt: z.string().datetime(),
  source: z.enum(["spotify", "manual", "unavailable"]).default("spotify")
});

export type SpotifyPresence = z.infer<typeof spotifyPresenceSchema>;

export const developerLogEventSchema = z.object({
  id: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  route: z.string().nullable(),
  method: z.string().nullable(),
  requestId: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  workspaceId: z.string().nullable(),
  userId: z.string().nullable(),
  deviceId: z.string().nullable(),
  integration: z.string().nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type DeveloperLogEvent = z.infer<typeof developerLogEventSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  actorType: z.enum(["system", "user", "device", "service", "admin"]),
  actorId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  userId: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const deviceLiveStateSchema = z.object({
  deviceId: z.string(),
  hardwareId: z.string().nullable(),
  name: z.string().nullable(),
  firmwareVersion: z.string().nullable(),
  connected: z.boolean(),
  connectedAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  lastServerTime: z.number().int().nullable(),
  sensors: z.record(z.string(), z.unknown()).nullable(),
  health: z.record(z.string(), z.unknown()).nullable(),
  activeRuleTypes: z.array(z.string())
});

export type DeviceLiveState = z.infer<typeof deviceLiveStateSchema>;

export const adminOverviewSchema = z.object({
  generatedAt: z.string().datetime(),
  counts: z.object({
    devices: z.number().int().nonnegative(),
    connectedDevices: z.number().int().nonnegative(),
    recentLogs: z.number().int().nonnegative(),
    recentAuditEvents: z.number().int().nonnegative(),
    spotifyConnections: z.number().int().nonnegative()
  }),
  services: z.object({
    database: z.enum(["up", "down"]),
    redis: z.enum(["up", "down"])
  })
});

export const spotifyConnectionStatusSchema = z.object({
  connected: z.boolean(),
  userId: z.string(),
  spotifyUserId: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  scopes: z.array(z.string()),
  presence: spotifyPresenceSchema.nullable()
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});
