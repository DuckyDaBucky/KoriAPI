import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, varchar } from "drizzle-orm/pg-core";
export const workspaceRoleEnum = pgEnum("workspace_role", [
    "platform_admin",
    "workspace_admin",
    "member",
    "device",
    "service"
]);
export const deviceStatusEnum = pgEnum("device_status", ["PENDING", "ACTIVE", "OFFLINE"]);
export const notificationSeverityEnum = pgEnum("notification_severity", ["LOW", "MEDIUM", "HIGH"]);
export const notificationStatusEnum = pgEnum("notification_status", [
    "PENDING",
    "SHOWN",
    "ACKNOWLEDGED",
    "DISMISSED"
]);
export const auditActorTypeEnum = pgEnum("audit_actor_type", ["system", "user", "device", "service", "admin"]);
export const deadlineStatusEnum = pgEnum("deadline_status", ["OPEN", "COMPLETED", "MISSED"]);
export const workspaces = pgTable("workspaces", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
export const users = pgTable("users", {
    id: varchar("id", { length: 64 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
export const workspaceMemberships = pgTable("workspace_memberships", {
    id: varchar("id", { length: 64 }).primaryKey(),
    role: workspaceRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const sessions = pgTable("sessions", {
    id: varchar("id", { length: 64 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const mfaFactors = pgTable("mfa_factors", {
    id: varchar("id", { length: 64 }).primaryKey(),
    type: varchar("type", { length: 32 }).notNull(),
    secretEnc: text("secret_enc").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const serviceTokens = pgTable("service_tokens", {
    id: varchar("id", { length: 64 }).primaryKey(),
    label: varchar("label", { length: 120 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 }).references(() => workspaces.id, { onDelete: "cascade" })
});
export const userApiKeys = pgTable("user_api_keys", {
    id: varchar("id", { length: 64 }).primaryKey(),
    label: varchar("label", { length: 120 }).notNull(),
    keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const deviceProvisioningCodes = pgTable("device_provisioning_codes", {
    id: varchar("id", { length: 64 }).primaryKey(),
    label: varchar("label", { length: 120 }),
    codeHash: varchar("code_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const devices = pgTable("devices", {
    id: varchar("id", { length: 64 }).primaryKey(),
    hardwareId: varchar("hardware_id", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    firmwareVersion: varchar("firmware_version", { length: 32 }).notNull(),
    status: deviceStatusEnum("status").default("PENDING").notNull(),
    protocolVersion: varchar("protocol_version", { length: 32 }).default("2026-04-16").notNull(),
    lastKnownServerTime: integer("last_known_server_time"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 64 }).references(() => workspaces.id, { onDelete: "set null" })
});
export const deviceTokens = pgTable("device_tokens", {
    id: varchar("id", { length: 64 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    deviceId: varchar("device_id", { length: 64 })
        .notNull()
        .references(() => devices.id, { onDelete: "cascade" })
});
export const deviceConfigs = pgTable("device_configs", {
    id: varchar("id", { length: 64 }).primaryKey(),
    telemetryIntervalSec: integer("telemetry_interval_sec").default(2).notNull(),
    thresholds: jsonb("thresholds").$type().notNull(),
    timerMethod: varchar("timer_method", { length: 64 }).default("pomodoro").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deviceId: varchar("device_id", { length: 64 })
        .notNull()
        .unique()
        .references(() => devices.id, { onDelete: "cascade" })
});
export const sensorSamples = pgTable("sensor_samples", {
    id: varchar("id", { length: 64 }).primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    deviceTs: integer("device_ts"),
    temperatureC: real("temperature_c"),
    humidityPct: real("humidity_pct"),
    pressureHpa: real("pressure_hpa"),
    co2Ppm: integer("co2_ppm"),
    tvocPpb: integer("tvoc_ppb"),
    noisePct: real("noise_pct").notNull(),
    lightPct: real("light_pct").notNull(),
    wifiHealth: varchar("wifi_health", { length: 32 }).notNull(),
    bme280Health: varchar("bme280_health", { length: 32 }).notNull(),
    ccs811Health: varchar("ccs811_health", { length: 32 }).notNull(),
    deviceId: varchar("device_id", { length: 64 })
        .notNull()
        .references(() => devices.id, { onDelete: "cascade" })
}, (table) => ({
    deviceReceivedIdx: index("sensor_samples_device_received_idx").on(table.deviceId, table.receivedAt)
}));
export const notifications = pgTable("notifications", {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    severity: notificationSeverityEnum("severity").notNull(),
    status: notificationStatusEnum("status").default("PENDING").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
    deviceId: varchar("device_id", { length: 64 })
        .notNull()
        .references(() => devices.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
});
export const notificationEvents = pgTable("notification_events", {
    id: varchar("id", { length: 64 }).primaryKey(),
    action: varchar("action", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    notificationId: varchar("notification_id", { length: 64 }).references(() => notifications.id, {
        onDelete: "set null"
    }),
    deviceId: varchar("device_id", { length: 64 })
        .notNull()
        .references(() => devices.id, { onDelete: "cascade" })
}, (table) => ({
    deviceCreatedIdx: index("notification_events_device_created_idx").on(table.deviceId, table.createdAt)
}));
export const auditLogs = pgTable("audit_logs", {
    id: varchar("id", { length: 64 }).primaryKey(),
    action: varchar("action", { length: 120 }).notNull(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: varchar("actor_id", { length: 64 }),
    resourceType: varchar("resource_type", { length: 120 }).notNull(),
    resourceId: varchar("resource_id", { length: 64 }),
    metadata: jsonb("metadata").$type().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 }).references(() => workspaces.id, { onDelete: "set null" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const quotas = pgTable("quotas", {
    id: varchar("id", { length: 64 }).primaryKey(),
    storageMb: integer("storage_mb").default(1024).notNull(),
    deviceLimit: integer("device_limit").default(10).notNull(),
    monthlyAiTokens: integer("monthly_ai_tokens").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .unique()
        .references(() => workspaces.id, { onDelete: "cascade" })
});
export const notes = pgTable("notes", {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const noteRevisions = pgTable("note_revisions", {
    id: varchar("id", { length: 64 }).primaryKey(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    noteId: varchar("note_id", { length: 64 })
        .notNull()
        .references(() => notes.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const documentAssets = pgTable("document_assets", {
    id: varchar("id", { length: 64 }).primaryKey(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    noteId: varchar("note_id", { length: 64 })
        .notNull()
        .references(() => notes.id, { onDelete: "cascade" })
});
export const deadlines = pgTable("deadlines", {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: deadlineStatusEnum("status").default("OPEN").notNull(),
    metadata: jsonb("metadata").$type().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const recommendations = pgTable("recommendations", {
    id: varchar("id", { length: 64 }).primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const connectorConfigs = pgTable("connector_configs", {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    configEnc: text("config_enc").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" })
});
export const connectorRuns = pgTable("connector_runs", {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" })
});
export const spotifyConnections = pgTable("spotify_connections", {
    id: varchar("id", { length: 64 }).primaryKey(),
    spotifyUserId: varchar("spotify_user_id", { length: 128 }),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .unique()
        .references(() => users.id, { onDelete: "cascade" })
});
export const spotifyPresenceEvents = pgTable("spotify_presence_events", {
    id: varchar("id", { length: 64 }).primaryKey(),
    isPlaying: boolean("is_playing").notNull(),
    trackId: varchar("track_id", { length: 128 }),
    trackName: varchar("track_name", { length: 240 }),
    albumName: varchar("album_name", { length: 240 }),
    artistNames: jsonb("artist_names").$type().notNull(),
    progressMs: integer("progress_ms"),
    deviceName: varchar("device_name", { length: 120 }),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    userId: varchar("user_id", { length: 64 })
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
}, (table) => ({
    userObservedIdx: index("spotify_presence_events_user_observed_idx").on(table.userId, table.observedAt)
}));
export const dashboardViews = pgTable("dashboard_views", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    filters: jsonb("filters").$type().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    workspaceId: varchar("workspace_id", { length: 64 })
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "set null" })
});
export const logIngestionOffsets = pgTable("log_ingestion_offsets", {
    id: varchar("id", { length: 64 }).primaryKey(),
    source: varchar("source", { length: 64 }).notNull().unique(),
    cursor: text("cursor").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
export const usersRelations = relations(users, ({ many }) => ({
    apiKeys: many(userApiKeys),
    devices: many(devices),
    notifications: many(notifications),
    memberships: many(workspaceMemberships)
}));
export const workspacesRelations = relations(workspaces, ({ many }) => ({
    memberships: many(workspaceMemberships),
    devices: many(devices)
}));
export const devicesRelations = relations(devices, ({ one, many }) => ({
    user: one(users, { fields: [devices.userId], references: [users.id] }),
    workspace: one(workspaces, { fields: [devices.workspaceId], references: [workspaces.id] }),
    config: one(deviceConfigs, { fields: [devices.id], references: [deviceConfigs.deviceId] }),
    tokens: many(deviceTokens),
    sensorSamples: many(sensorSamples),
    notifications: many(notifications),
    notificationEvents: many(notificationEvents)
}));
export const dbTables = {
    workspaces,
    users,
    workspaceMemberships,
    sessions,
    mfaFactors,
    serviceTokens,
    userApiKeys,
    deviceProvisioningCodes,
    devices,
    deviceTokens,
    deviceConfigs,
    sensorSamples,
    notifications,
    notificationEvents,
    auditLogs,
    quotas,
    notes,
    noteRevisions,
    documentAssets,
    deadlines,
    recommendations,
    connectorConfigs,
    connectorRuns,
    spotifyConnections,
    spotifyPresenceEvents,
    dashboardViews,
    logIngestionOffsets
};
export const nowSql = sql `now()`;
//# sourceMappingURL=schema.js.map