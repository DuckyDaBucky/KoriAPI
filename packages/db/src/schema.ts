import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { DeviceConfig } from "@kori/shared";

export const deviceStatusEnum = pgEnum("device_status", ["PENDING", "ACTIVE", "OFFLINE"]);
export const notificationSeverityEnum = pgEnum("notification_severity", ["LOW", "MEDIUM", "HIGH"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "PENDING",
  "SHOWN",
  "ACKNOWLEDGED",
  "DISMISSED",
]);

export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    .references(() => users.id, { onDelete: "cascade" }),
});

export const devices = pgTable("devices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  hardwareId: varchar("hardware_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  firmwareVersion: varchar("firmware_version", { length: 32 }).notNull(),
  status: deviceStatusEnum("status").default("PENDING").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  userId: varchar("user_id", { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const deviceTokens = pgTable("device_tokens", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  deviceId: varchar("device_id", { length: 64 })
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
});

export const deviceConfigs = pgTable("device_configs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  telemetryIntervalSec: integer("telemetry_interval_sec").default(2).notNull(),
  thresholds: jsonb("thresholds").$type<DeviceConfig["thresholds"]>().notNull(),
  timerMethod: varchar("timer_method", { length: 64 }).default("pomodoro").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deviceId: varchar("device_id", { length: 64 })
    .notNull()
    .unique()
    .references(() => devices.id, { onDelete: "cascade" }),
});

export const sensorSamples = pgTable(
  "sensor_samples",
  {
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
      .references(() => devices.id, { onDelete: "cascade" }),
  },
  (table) => ({
    deviceReceivedIdx: index("sensor_samples_device_received_idx").on(table.deviceId, table.receivedAt),
  }),
);

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
    .references(() => users.id, { onDelete: "cascade" }),
});

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    action: varchar("action", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    notificationId: varchar("notification_id", { length: 64 }).references(() => notifications.id, {
      onDelete: "set null",
    }),
    deviceId: varchar("device_id", { length: 64 })
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
  },
  (table) => ({
    deviceCreatedIdx: index("notification_events_device_created_idx").on(table.deviceId, table.createdAt),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(userApiKeys),
  devices: many(devices),
  notifications: many(notifications),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
  config: one(deviceConfigs, { fields: [devices.id], references: [deviceConfigs.deviceId] }),
  tokens: many(deviceTokens),
  sensorSamples: many(sensorSamples),
  notifications: many(notifications),
  notificationEvents: many(notificationEvents),
}));

export const dbTables = {
  users,
  userApiKeys,
  devices,
  deviceTokens,
  deviceConfigs,
  sensorSamples,
  notifications,
  notificationEvents,
};

export type DatabaseSchema = typeof dbTables;
export const nowSql = sql`now()`;
