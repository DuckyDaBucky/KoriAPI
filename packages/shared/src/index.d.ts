import { z } from "zod";
export declare const wsEventTypes: {
    readonly deviceHello: "device:hello";
    readonly deviceSensors: "device:sensors";
    readonly deviceHealth: "device:health";
    readonly deviceNotificationEvent: "device:notification_event";
    readonly sessionReady: "session:ready";
    readonly adminReady: "admin:ready";
    readonly adminLog: "admin:log";
    readonly adminDeviceState: "admin:device_state";
    readonly adminAudit: "admin:audit";
    readonly adminSpotifyPresence: "admin:spotify_presence";
    readonly adminOverview: "admin:overview";
    readonly prefsUpdate: "prefs:update";
    readonly notificationShow: "notification:show";
    readonly recommendationShow: "recommendation:show";
    readonly vibeSet: "vibe:set";
    readonly spotifyState: "spotify:state";
    readonly ping: "ping";
    readonly pong: "pong";
    readonly timeSync: "time:sync";
};
export declare const workspaceRoleSchema: z.ZodEnum<["platform_admin", "workspace_admin", "member", "device", "service"]>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export declare const deviceConfigSchema: z.ZodObject<{
    telemetryIntervalSec: z.ZodDefault<z.ZodNumber>;
    thresholds: z.ZodDefault<z.ZodObject<{
        co2Ppm: z.ZodDefault<z.ZodNumber>;
        noisePct: z.ZodDefault<z.ZodNumber>;
        temperatureHighC: z.ZodDefault<z.ZodNumber>;
        temperatureLowC: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        co2Ppm: number;
        noisePct: number;
        temperatureHighC: number;
        temperatureLowC: number;
    }, {
        co2Ppm?: number | undefined;
        noisePct?: number | undefined;
        temperatureHighC?: number | undefined;
        temperatureLowC?: number | undefined;
    }>>;
    timerMethod: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    telemetryIntervalSec: number;
    thresholds: {
        co2Ppm: number;
        noisePct: number;
        temperatureHighC: number;
        temperatureLowC: number;
    };
    timerMethod: string;
}, {
    telemetryIntervalSec?: number | undefined;
    thresholds?: {
        co2Ppm?: number | undefined;
        noisePct?: number | undefined;
        temperatureHighC?: number | undefined;
        temperatureLowC?: number | undefined;
    } | undefined;
    timerMethod?: string | undefined;
}>;
export type DeviceConfig = z.infer<typeof deviceConfigSchema>;
export declare const bootstrapRequestSchema: z.ZodEffects<z.ZodObject<{
    hardwareId: z.ZodString;
    userApiKey: z.ZodOptional<z.ZodString>;
    provisioningCode: z.ZodOptional<z.ZodString>;
    deviceName: z.ZodString;
    firmwareVersion: z.ZodString;
}, "strip", z.ZodTypeAny, {
    hardwareId: string;
    firmwareVersion: string;
    deviceName: string;
    userApiKey?: string | undefined;
    provisioningCode?: string | undefined;
}, {
    hardwareId: string;
    firmwareVersion: string;
    deviceName: string;
    userApiKey?: string | undefined;
    provisioningCode?: string | undefined;
}>, {
    hardwareId: string;
    firmwareVersion: string;
    deviceName: string;
    userApiKey?: string | undefined;
    provisioningCode?: string | undefined;
}, {
    hardwareId: string;
    firmwareVersion: string;
    deviceName: string;
    userApiKey?: string | undefined;
    provisioningCode?: string | undefined;
}>;
export declare const bootstrapResponseSchema: z.ZodObject<{
    deviceId: z.ZodString;
    deviceToken: z.ZodString;
    wsUrl: z.ZodString;
    config: z.ZodObject<{
        telemetryIntervalSec: z.ZodDefault<z.ZodNumber>;
        thresholds: z.ZodDefault<z.ZodObject<{
            co2Ppm: z.ZodDefault<z.ZodNumber>;
            noisePct: z.ZodDefault<z.ZodNumber>;
            temperatureHighC: z.ZodDefault<z.ZodNumber>;
            temperatureLowC: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            co2Ppm: number;
            noisePct: number;
            temperatureHighC: number;
            temperatureLowC: number;
        }, {
            co2Ppm?: number | undefined;
            noisePct?: number | undefined;
            temperatureHighC?: number | undefined;
            temperatureLowC?: number | undefined;
        }>>;
        timerMethod: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        telemetryIntervalSec: number;
        thresholds: {
            co2Ppm: number;
            noisePct: number;
            temperatureHighC: number;
            temperatureLowC: number;
        };
        timerMethod: string;
    }, {
        telemetryIntervalSec?: number | undefined;
        thresholds?: {
            co2Ppm?: number | undefined;
            noisePct?: number | undefined;
            temperatureHighC?: number | undefined;
            temperatureLowC?: number | undefined;
        } | undefined;
        timerMethod?: string | undefined;
    }>;
    serverTime: z.ZodNumber;
    protocolVersion: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    protocolVersion: string;
    deviceId: string;
    config: {
        telemetryIntervalSec: number;
        thresholds: {
            co2Ppm: number;
            noisePct: number;
            temperatureHighC: number;
            temperatureLowC: number;
        };
        timerMethod: string;
    };
    deviceToken: string;
    wsUrl: string;
    serverTime: number;
}, {
    deviceId: string;
    config: {
        telemetryIntervalSec?: number | undefined;
        thresholds?: {
            co2Ppm?: number | undefined;
            noisePct?: number | undefined;
            temperatureHighC?: number | undefined;
            temperatureLowC?: number | undefined;
        } | undefined;
        timerMethod?: string | undefined;
    };
    deviceToken: string;
    wsUrl: string;
    serverTime: number;
    protocolVersion?: string | undefined;
}>;
export declare const provisioningCodeRequestSchema: z.ZodObject<{
    workspaceId: z.ZodString;
    userId: z.ZodString;
    expiresInSec: z.ZodDefault<z.ZodNumber>;
    label: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    workspaceId: string;
    userId: string;
    expiresInSec: number;
    label?: string | undefined;
}, {
    workspaceId: string;
    userId: string;
    label?: string | undefined;
    expiresInSec?: number | undefined;
}>;
export declare const provisioningCodeResponseSchema: z.ZodObject<{
    code: z.ZodString;
    workspaceId: z.ZodString;
    userId: z.ZodString;
    expiresAt: z.ZodString;
    label: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    workspaceId: string;
    userId: string;
    expiresAt: string;
    label: string | null;
    code: string;
}, {
    workspaceId: string;
    userId: string;
    expiresAt: string;
    code: string;
    label?: string | null | undefined;
}>;
export declare const deviceTokenRotateResponseSchema: z.ZodObject<{
    deviceToken: z.ZodString;
    expiresAt: z.ZodString;
    rotatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    expiresAt: string;
    deviceToken: string;
    rotatedAt: string;
}, {
    expiresAt: string;
    deviceToken: string;
    rotatedAt: string;
}>;
export declare const inboundEnvelopeSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"device:hello">;
    ts: z.ZodOptional<z.ZodNumber>;
    payload: z.ZodObject<{
        deviceId: z.ZodOptional<z.ZodString>;
        token: z.ZodOptional<z.ZodString>;
        firmwareVersion: z.ZodString;
        hardwareId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        hardwareId: string;
        firmwareVersion: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    }, {
        hardwareId: string;
        firmwareVersion: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "device:hello";
    payload: {
        hardwareId: string;
        firmwareVersion: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    };
    ts?: number | undefined;
}, {
    type: "device:hello";
    payload: {
        hardwareId: string;
        firmwareVersion: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    };
    ts?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"device:sensors">;
    ts: z.ZodOptional<z.ZodNumber>;
    payload: z.ZodObject<{
        deviceId: z.ZodOptional<z.ZodString>;
        token: z.ZodOptional<z.ZodString>;
        ts: z.ZodOptional<z.ZodNumber>;
        sensors: z.ZodObject<{
            temp: z.ZodOptional<z.ZodNumber>;
            humidity: z.ZodOptional<z.ZodNumber>;
            pressure: z.ZodOptional<z.ZodNumber>;
            co2: z.ZodOptional<z.ZodNumber>;
            tvoc: z.ZodOptional<z.ZodNumber>;
            noise: z.ZodNumber;
            light: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        }, {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        }>;
        health: z.ZodObject<{
            wifi: z.ZodString;
            bme280: z.ZodString;
            ccs811: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            wifi: string;
            bme280: string;
            ccs811: string;
        }, {
            wifi: string;
            bme280: string;
            ccs811: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        sensors: {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        };
        health: {
            wifi: string;
            bme280: string;
            ccs811: string;
        };
        deviceId?: string | undefined;
        token?: string | undefined;
        ts?: number | undefined;
    }, {
        sensors: {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        };
        health: {
            wifi: string;
            bme280: string;
            ccs811: string;
        };
        deviceId?: string | undefined;
        token?: string | undefined;
        ts?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "device:sensors";
    payload: {
        sensors: {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        };
        health: {
            wifi: string;
            bme280: string;
            ccs811: string;
        };
        deviceId?: string | undefined;
        token?: string | undefined;
        ts?: number | undefined;
    };
    ts?: number | undefined;
}, {
    type: "device:sensors";
    payload: {
        sensors: {
            noise: number;
            light: number;
            temp?: number | undefined;
            humidity?: number | undefined;
            pressure?: number | undefined;
            co2?: number | undefined;
            tvoc?: number | undefined;
        };
        health: {
            wifi: string;
            bme280: string;
            ccs811: string;
        };
        deviceId?: string | undefined;
        token?: string | undefined;
        ts?: number | undefined;
    };
    ts?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"device:health">;
    ts: z.ZodOptional<z.ZodNumber>;
    payload: z.ZodObject<{
        deviceId: z.ZodOptional<z.ZodString>;
        token: z.ZodOptional<z.ZodString>;
        uptimeSec: z.ZodOptional<z.ZodNumber>;
        freeHeap: z.ZodOptional<z.ZodNumber>;
        wifiRssi: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        deviceId?: string | undefined;
        token?: string | undefined;
        uptimeSec?: number | undefined;
        freeHeap?: number | undefined;
        wifiRssi?: number | undefined;
    }, {
        deviceId?: string | undefined;
        token?: string | undefined;
        uptimeSec?: number | undefined;
        freeHeap?: number | undefined;
        wifiRssi?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "device:health";
    payload: {
        deviceId?: string | undefined;
        token?: string | undefined;
        uptimeSec?: number | undefined;
        freeHeap?: number | undefined;
        wifiRssi?: number | undefined;
    };
    ts?: number | undefined;
}, {
    type: "device:health";
    payload: {
        deviceId?: string | undefined;
        token?: string | undefined;
        uptimeSec?: number | undefined;
        freeHeap?: number | undefined;
        wifiRssi?: number | undefined;
    };
    ts?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"device:notification_event">;
    ts: z.ZodOptional<z.ZodNumber>;
    payload: z.ZodObject<{
        deviceId: z.ZodOptional<z.ZodString>;
        token: z.ZodOptional<z.ZodString>;
        notificationId: z.ZodString;
        action: z.ZodEnum<["shown", "acknowledged", "dismissed"]>;
    }, "strip", z.ZodTypeAny, {
        action: "shown" | "acknowledged" | "dismissed";
        notificationId: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    }, {
        action: "shown" | "acknowledged" | "dismissed";
        notificationId: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "device:notification_event";
    payload: {
        action: "shown" | "acknowledged" | "dismissed";
        notificationId: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    };
    ts?: number | undefined;
}, {
    type: "device:notification_event";
    payload: {
        action: "shown" | "acknowledged" | "dismissed";
        notificationId: string;
        deviceId?: string | undefined;
        token?: string | undefined;
    };
    ts?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"pong">;
    ts: z.ZodOptional<z.ZodNumber>;
    payload: z.ZodDefault<z.ZodOptional<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>>>;
}, "strip", z.ZodTypeAny, {
    type: "pong";
    payload: {} & {
        [k: string]: unknown;
    };
    ts?: number | undefined;
}, {
    type: "pong";
    ts?: number | undefined;
    payload?: z.objectInputType<{}, z.ZodTypeAny, "passthrough"> | undefined;
}>]>;
export type InboundEnvelope = z.infer<typeof inboundEnvelopeSchema>;
export declare const outboundEnvelopeSchema: z.ZodObject<{
    type: z.ZodEnum<["session:ready", "admin:ready", "admin:log", "admin:device_state", "admin:audit", "admin:spotify_presence", "admin:overview", "prefs:update", "notification:show", "recommendation:show", "vibe:set", "spotify:state", "ping", "time:sync"]>;
    ts: z.ZodNumber;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    type: "admin:audit" | "admin:log" | "admin:device_state" | "admin:spotify_presence" | "admin:overview" | "session:ready" | "admin:ready" | "prefs:update" | "notification:show" | "recommendation:show" | "vibe:set" | "spotify:state" | "ping" | "time:sync";
    ts: number;
    payload: Record<string, unknown>;
}, {
    type: "admin:audit" | "admin:log" | "admin:device_state" | "admin:spotify_presence" | "admin:overview" | "session:ready" | "admin:ready" | "prefs:update" | "notification:show" | "recommendation:show" | "vibe:set" | "spotify:state" | "ping" | "time:sync";
    ts: number;
    payload: Record<string, unknown>;
}>;
export type OutboundEnvelope = z.infer<typeof outboundEnvelopeSchema>;
export declare const healthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["ok", "degraded"]>;
    time: z.ZodString;
    services: z.ZodObject<{
        database: z.ZodEnum<["up", "down"]>;
        redis: z.ZodEnum<["up", "down"]>;
    }, "strip", z.ZodTypeAny, {
        database: "up" | "down";
        redis: "up" | "down";
    }, {
        database: "up" | "down";
        redis: "up" | "down";
    }>;
}, "strip", z.ZodTypeAny, {
    status: "ok" | "degraded";
    services: {
        database: "up" | "down";
        redis: "up" | "down";
    };
    time: string;
}, {
    status: "ok" | "degraded";
    services: {
        database: "up" | "down";
        redis: "up" | "down";
    };
    time: string;
}>;
export declare const notificationSeveritySchema: z.ZodEnum<["low", "medium", "high"]>;
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export declare const spotifyPresenceSchema: z.ZodObject<{
    userId: z.ZodString;
    isPlaying: z.ZodBoolean;
    trackId: z.ZodNullable<z.ZodString>;
    trackName: z.ZodNullable<z.ZodString>;
    artistNames: z.ZodArray<z.ZodString, "many">;
    albumName: z.ZodNullable<z.ZodString>;
    startedAt: z.ZodNullable<z.ZodString>;
    progressMs: z.ZodNullable<z.ZodNumber>;
    deviceName: z.ZodNullable<z.ZodString>;
    observedAt: z.ZodString;
    source: z.ZodDefault<z.ZodEnum<["spotify", "manual", "unavailable"]>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    startedAt: string | null;
    isPlaying: boolean;
    trackId: string | null;
    trackName: string | null;
    albumName: string | null;
    artistNames: string[];
    progressMs: number | null;
    deviceName: string | null;
    observedAt: string;
    source: "spotify" | "manual" | "unavailable";
}, {
    userId: string;
    startedAt: string | null;
    isPlaying: boolean;
    trackId: string | null;
    trackName: string | null;
    albumName: string | null;
    artistNames: string[];
    progressMs: number | null;
    deviceName: string | null;
    observedAt: string;
    source?: "spotify" | "manual" | "unavailable" | undefined;
}>;
export type SpotifyPresence = z.infer<typeof spotifyPresenceSchema>;
export declare const developerLogEventSchema: z.ZodObject<{
    id: z.ZodString;
    level: z.ZodEnum<["debug", "info", "warn", "error"]>;
    message: z.ZodString;
    route: z.ZodNullable<z.ZodString>;
    method: z.ZodNullable<z.ZodString>;
    requestId: z.ZodNullable<z.ZodString>;
    statusCode: z.ZodNullable<z.ZodNumber>;
    workspaceId: z.ZodNullable<z.ZodString>;
    userId: z.ZodNullable<z.ZodString>;
    deviceId: z.ZodNullable<z.ZodString>;
    integration: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    level: "error" | "warn" | "info" | "debug";
    id: string;
    createdAt: string;
    workspaceId: string | null;
    userId: string | null;
    deviceId: string | null;
    metadata: Record<string, unknown>;
    message: string;
    route: string | null;
    method: string | null;
    requestId: string | null;
    statusCode: number | null;
    integration: string | null;
}, {
    level: "error" | "warn" | "info" | "debug";
    id: string;
    createdAt: string;
    workspaceId: string | null;
    userId: string | null;
    deviceId: string | null;
    message: string;
    route: string | null;
    method: string | null;
    requestId: string | null;
    statusCode: number | null;
    integration: string | null;
    metadata?: Record<string, unknown> | undefined;
}>;
export type DeveloperLogEvent = z.infer<typeof developerLogEventSchema>;
export declare const auditEventSchema: z.ZodObject<{
    id: z.ZodString;
    action: z.ZodString;
    actorType: z.ZodEnum<["system", "user", "device", "service", "admin"]>;
    actorId: z.ZodNullable<z.ZodString>;
    workspaceId: z.ZodNullable<z.ZodString>;
    userId: z.ZodNullable<z.ZodString>;
    resourceType: z.ZodString;
    resourceId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    workspaceId: string | null;
    userId: string | null;
    action: string;
    actorType: "device" | "service" | "system" | "user" | "admin";
    actorId: string | null;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown>;
}, {
    id: string;
    createdAt: string;
    workspaceId: string | null;
    userId: string | null;
    action: string;
    actorType: "device" | "service" | "system" | "user" | "admin";
    actorId: string | null;
    resourceType: string;
    resourceId: string | null;
    metadata?: Record<string, unknown> | undefined;
}>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export declare const deviceLiveStateSchema: z.ZodObject<{
    deviceId: z.ZodString;
    hardwareId: z.ZodNullable<z.ZodString>;
    name: z.ZodNullable<z.ZodString>;
    firmwareVersion: z.ZodNullable<z.ZodString>;
    connected: z.ZodBoolean;
    connectedAt: z.ZodNullable<z.ZodString>;
    lastSeenAt: z.ZodNullable<z.ZodString>;
    lastServerTime: z.ZodNullable<z.ZodNumber>;
    sensors: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    health: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    activeRuleTypes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    name: string | null;
    hardwareId: string | null;
    firmwareVersion: string | null;
    lastSeenAt: string | null;
    deviceId: string;
    connectedAt: string | null;
    connected: boolean;
    lastServerTime: number | null;
    sensors: Record<string, unknown> | null;
    health: Record<string, unknown> | null;
    activeRuleTypes: string[];
}, {
    name: string | null;
    hardwareId: string | null;
    firmwareVersion: string | null;
    lastSeenAt: string | null;
    deviceId: string;
    connectedAt: string | null;
    connected: boolean;
    lastServerTime: number | null;
    sensors: Record<string, unknown> | null;
    health: Record<string, unknown> | null;
    activeRuleTypes: string[];
}>;
export type DeviceLiveState = z.infer<typeof deviceLiveStateSchema>;
export declare const adminOverviewSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    counts: z.ZodObject<{
        devices: z.ZodNumber;
        connectedDevices: z.ZodNumber;
        recentLogs: z.ZodNumber;
        recentAuditEvents: z.ZodNumber;
        spotifyConnections: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        devices: number;
        spotifyConnections: number;
        connectedDevices: number;
        recentLogs: number;
        recentAuditEvents: number;
    }, {
        devices: number;
        spotifyConnections: number;
        connectedDevices: number;
        recentLogs: number;
        recentAuditEvents: number;
    }>;
    services: z.ZodObject<{
        database: z.ZodEnum<["up", "down"]>;
        redis: z.ZodEnum<["up", "down"]>;
    }, "strip", z.ZodTypeAny, {
        database: "up" | "down";
        redis: "up" | "down";
    }, {
        database: "up" | "down";
        redis: "up" | "down";
    }>;
}, "strip", z.ZodTypeAny, {
    services: {
        database: "up" | "down";
        redis: "up" | "down";
    };
    generatedAt: string;
    counts: {
        devices: number;
        spotifyConnections: number;
        connectedDevices: number;
        recentLogs: number;
        recentAuditEvents: number;
    };
}, {
    services: {
        database: "up" | "down";
        redis: "up" | "down";
    };
    generatedAt: string;
    counts: {
        devices: number;
        spotifyConnections: number;
        connectedDevices: number;
        recentLogs: number;
        recentAuditEvents: number;
    };
}>;
export declare const spotifyConnectionStatusSchema: z.ZodObject<{
    connected: z.ZodBoolean;
    userId: z.ZodString;
    spotifyUserId: z.ZodNullable<z.ZodString>;
    lastSyncedAt: z.ZodNullable<z.ZodString>;
    scopes: z.ZodArray<z.ZodString, "many">;
    presence: z.ZodNullable<z.ZodObject<{
        userId: z.ZodString;
        isPlaying: z.ZodBoolean;
        trackId: z.ZodNullable<z.ZodString>;
        trackName: z.ZodNullable<z.ZodString>;
        artistNames: z.ZodArray<z.ZodString, "many">;
        albumName: z.ZodNullable<z.ZodString>;
        startedAt: z.ZodNullable<z.ZodString>;
        progressMs: z.ZodNullable<z.ZodNumber>;
        deviceName: z.ZodNullable<z.ZodString>;
        observedAt: z.ZodString;
        source: z.ZodDefault<z.ZodEnum<["spotify", "manual", "unavailable"]>>;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        startedAt: string | null;
        isPlaying: boolean;
        trackId: string | null;
        trackName: string | null;
        albumName: string | null;
        artistNames: string[];
        progressMs: number | null;
        deviceName: string | null;
        observedAt: string;
        source: "spotify" | "manual" | "unavailable";
    }, {
        userId: string;
        startedAt: string | null;
        isPlaying: boolean;
        trackId: string | null;
        trackName: string | null;
        albumName: string | null;
        artistNames: string[];
        progressMs: number | null;
        deviceName: string | null;
        observedAt: string;
        source?: "spotify" | "manual" | "unavailable" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    spotifyUserId: string | null;
    scopes: string[];
    lastSyncedAt: string | null;
    connected: boolean;
    presence: {
        userId: string;
        startedAt: string | null;
        isPlaying: boolean;
        trackId: string | null;
        trackName: string | null;
        albumName: string | null;
        artistNames: string[];
        progressMs: number | null;
        deviceName: string | null;
        observedAt: string;
        source: "spotify" | "manual" | "unavailable";
    } | null;
}, {
    userId: string;
    spotifyUserId: string | null;
    scopes: string[];
    lastSyncedAt: string | null;
    connected: boolean;
    presence: {
        userId: string;
        startedAt: string | null;
        isPlaying: boolean;
        trackId: string | null;
        trackName: string | null;
        albumName: string | null;
        artistNames: string[];
        progressMs: number | null;
        deviceName: string | null;
        observedAt: string;
        source?: "spotify" | "manual" | "unavailable" | undefined;
    } | null;
}>;
export declare const errorEnvelopeSchema: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
    }, {
        code: string;
        message: string;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: string;
        message: string;
    };
}, {
    error: {
        code: string;
        message: string;
    };
}>;
//# sourceMappingURL=index.d.ts.map