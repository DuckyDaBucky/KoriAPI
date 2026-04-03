import { and, eq, isNull, sql } from "drizzle-orm";
import { createDbClient, schema } from "@kori/db";
import { deviceConfigSchema } from "@kori/shared";
import { randomUUID } from "node:crypto";
import { sha256, generateOpaqueToken } from "../utils/crypto.js";
import { evaluateRules } from "./rules.js";
import type {
  AuthenticatedDevice,
  BootstrapResult,
  BootstrapService,
  DeviceAuthService,
  HealthService,
  NotificationEventService,
  RedisClient,
  SensorIngestionInput,
  SensorIngestionResult,
  SensorIngestionService,
  ServiceHealth,
} from "./types.js";

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function getDb() {
  return createDbClient();
}

function normalizeDeviceConfig(row?: {
  telemetryIntervalSec: number;
  thresholds: unknown;
  timerMethod: string;
} | null) {
  return deviceConfigSchema.parse(
    row
      ? {
          telemetryIntervalSec: row.telemetryIntervalSec,
          thresholds: row.thresholds,
          timerMethod: row.timerMethod,
        }
      : {},
  );
}

export class DrizzleDeviceService implements BootstrapService, DeviceAuthService {
  async bootstrap(input: {
    hardwareId: string;
    userApiKey: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult> {
    const db = getDb();
    const apiKey = await db.query.userApiKeys.findFirst({
      columns: {
        id: true,
        userId: true,
      },
      where: and(
        eq(schema.userApiKeys.keyHash, sha256(input.userApiKey)),
        eq(schema.userApiKeys.isActive, true),
      ),
    });

    if (!apiKey) {
      throw new Error("INVALID_USER_API_KEY");
    }

    const defaultConfig = deviceConfigSchema.parse({});
    let device = await db.query.devices.findFirst({
      where: eq(schema.devices.hardwareId, input.hardwareId),
    });

    if (!device) {
      const newDeviceId = createId("dev");
      await db.insert(schema.devices).values({
        id: newDeviceId,
        hardwareId: input.hardwareId,
        name: input.deviceName,
        firmwareVersion: input.firmwareVersion,
        status: "ACTIVE",
        userId: apiKey.userId,
        lastSeenAt: new Date(),
      });

      await db.insert(schema.deviceConfigs).values({
        id: createId("cfg"),
        deviceId: newDeviceId,
        telemetryIntervalSec: defaultConfig.telemetryIntervalSec,
        thresholds: defaultConfig.thresholds,
        timerMethod: defaultConfig.timerMethod,
      });

      device = await db.query.devices.findFirst({
        where: eq(schema.devices.id, newDeviceId),
      });
    } else {
      await db
        .update(schema.devices)
        .set({
          name: input.deviceName,
          firmwareVersion: input.firmwareVersion,
          status: "ACTIVE",
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.devices.id, device.id));
    }

    if (!device) {
      throw new Error("DEVICE_BOOTSTRAP_FAILED");
    }

    const existingConfig = await db.query.deviceConfigs.findFirst({
      where: eq(schema.deviceConfigs.deviceId, device.id),
    });

    if (!existingConfig) {
      await db.insert(schema.deviceConfigs).values({
        id: createId("cfg"),
        deviceId: device.id,
        telemetryIntervalSec: defaultConfig.telemetryIntervalSec,
        thresholds: defaultConfig.thresholds,
        timerMethod: defaultConfig.timerMethod,
      });
    }

    await db
      .update(schema.userApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.userApiKeys.id, apiKey.id));

    await db
      .update(schema.deviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.deviceTokens.deviceId, device.id), isNull(schema.deviceTokens.revokedAt)));

    const rawToken = generateOpaqueToken();
    await db.insert(schema.deviceTokens).values({
      id: createId("dtok"),
      tokenHash: sha256(rawToken),
      deviceId: device.id,
    });

    const config = normalizeDeviceConfig(
      existingConfig ??
        (await db.query.deviceConfigs.findFirst({
          where: eq(schema.deviceConfigs.deviceId, device.id),
        })),
    );

    return {
      deviceId: device.id,
      deviceToken: rawToken,
      wsUrl: input.wsUrl,
      config,
      serverTime: Math.floor(Date.now() / 1000),
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
    const db = getDb();
    const row = await db
      .select({
        deviceId: schema.devices.id,
        userId: schema.devices.userId,
        telemetryIntervalSec: schema.deviceConfigs.telemetryIntervalSec,
        thresholds: schema.deviceConfigs.thresholds,
        timerMethod: schema.deviceConfigs.timerMethod,
      })
      .from(schema.deviceTokens)
      .innerJoin(schema.devices, eq(schema.deviceTokens.deviceId, schema.devices.id))
      .leftJoin(schema.deviceConfigs, eq(schema.deviceConfigs.deviceId, schema.devices.id))
      .where(
        and(
          eq(schema.deviceTokens.tokenHash, sha256(token)),
          isNull(schema.deviceTokens.revokedAt),
        ),
      )
      .limit(1);

    const match = row[0];
    if (!match) {
      return null;
    }

    return {
      id: match.deviceId,
      userId: match.userId,
      config: normalizeDeviceConfig({
        telemetryIntervalSec: match.telemetryIntervalSec ?? 2,
        thresholds: match.thresholds ?? undefined,
        timerMethod: match.timerMethod ?? "pomodoro",
      }),
    };
  }
}

export class DrizzleHealthService implements HealthService {
  constructor(private readonly redis: RedisClient) {}

  async databaseHealth(): Promise<ServiceHealth> {
    try {
      const db = getDb();
      await db.execute(sql`select 1`);
      return "up";
    } catch {
      return "down";
    }
  }

  async redisHealth(): Promise<ServiceHealth> {
    try {
      await this.redis.ping();
      return "up";
    } catch {
      return "down";
    }
  }
}

export class DrizzleSensorIngestionService implements SensorIngestionService {
  async ingest(input: SensorIngestionInput): Promise<SensorIngestionResult> {
    const db = getDb();
    const receivedAt = Math.floor(Date.now() / 1000);
    const notifications = evaluateRules(input, input.device.config);

    await db
      .update(schema.devices)
      .set({
        lastSeenAt: new Date(receivedAt * 1000),
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(schema.devices.id, input.device.id));

    await db.insert(schema.sensorSamples).values({
      id: createId("sample"),
      deviceId: input.device.id,
      receivedAt: new Date(receivedAt * 1000),
      deviceTs: input.eventTs ?? null,
      temperatureC: input.sensors.temp ?? null,
      humidityPct: input.sensors.humidity ?? null,
      pressureHpa: input.sensors.pressure ?? null,
      co2Ppm: input.sensors.co2 ?? null,
      tvocPpb: input.sensors.tvoc ?? null,
      noisePct: input.sensors.noise,
      lightPct: input.sensors.light,
      wifiHealth: input.health.wifi,
      bme280Health: input.health.bme280,
      ccs811Health: input.health.ccs811,
    });

    if (notifications.length > 0) {
      await db.insert(schema.notifications).values(
        notifications.map((notification) => ({
          id: createId("notif"),
          deviceId: input.device.id,
          userId: input.device.userId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          severity: notification.severity.toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
        })),
      );
    }

    return {
      receivedAt,
      notifications,
    };
  }
}

export class DrizzleNotificationEventService implements NotificationEventService {
  async recordEvent(input: {
    deviceId: string;
    notificationId: string;
    action: "shown" | "acknowledged" | "dismissed";
  }): Promise<void> {
    const db = getDb();
    await db.insert(schema.notificationEvents).values({
      id: createId("nevt"),
      deviceId: input.deviceId,
      notificationId: input.notificationId,
      action: input.action,
    });

    await db
      .update(schema.notifications)
      .set({
        status: input.action === "shown" ? "SHOWN" : input.action === "acknowledged" ? "ACKNOWLEDGED" : "DISMISSED",
        updatedAt: new Date(),
        ...(input.action === "shown" ? { shownAt: new Date() } : {}),
      })
      .where(eq(schema.notifications.id, input.notificationId));
  }
}
