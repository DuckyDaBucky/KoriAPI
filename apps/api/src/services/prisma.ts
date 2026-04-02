import { prisma } from "@kori/db";
import { Prisma } from "@prisma/client";
import { deviceConfigSchema } from "@kori/shared";
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
  ServiceHealth
} from "./types.js";

export class PrismaDeviceService implements BootstrapService, DeviceAuthService {
  async bootstrap(input: {
    hardwareId: string;
    userApiKey: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult> {
    const apiKey = await prisma.userApiKey.findFirst({
      where: {
        keyHash: sha256(input.userApiKey),
        isActive: true
      }
    });

    if (!apiKey) {
      throw new Error("INVALID_USER_API_KEY");
    }

    const defaultConfig = deviceConfigSchema.parse({});
    const device = await prisma.device.upsert({
      where: {
        hardwareId: input.hardwareId
      },
      update: {
        name: input.deviceName,
        firmwareVersion: input.firmwareVersion,
        status: "ACTIVE",
        lastSeenAt: new Date()
      },
      create: {
        hardwareId: input.hardwareId,
        name: input.deviceName,
        firmwareVersion: input.firmwareVersion,
        status: "ACTIVE",
        lastSeenAt: new Date(),
        userId: apiKey.userId,
        config: {
          create: {
            telemetryIntervalSec: defaultConfig.telemetryIntervalSec,
            thresholds: defaultConfig.thresholds as unknown as Prisma.InputJsonValue,
            timerMethod: defaultConfig.timerMethod
          }
        }
      },
      include: {
        config: true
      }
    });

    await prisma.deviceToken.updateMany({
      where: {
        deviceId: device.id,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    const rawToken = generateOpaqueToken();
    await prisma.deviceToken.create({
      data: {
        tokenHash: sha256(rawToken),
        deviceId: device.id
      }
    });

    const config = device.config
      ? deviceConfigSchema.parse({
          telemetryIntervalSec: device.config.telemetryIntervalSec,
          thresholds: device.config.thresholds,
          timerMethod: device.config.timerMethod
        })
      : defaultConfig;

    return {
      deviceId: device.id,
      deviceToken: rawToken,
      wsUrl: input.wsUrl,
      config,
      serverTime: Math.floor(Date.now() / 1000)
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
    const deviceToken = await prisma.deviceToken.findFirst({
      where: {
        tokenHash: sha256(token),
        revokedAt: null
      },
      include: {
        device: {
          include: {
            config: true
          }
        }
      }
    });

    if (!deviceToken?.device) {
      return null;
    }

    return {
      id: deviceToken.device.id,
      userId: deviceToken.device.userId,
      config: deviceConfigSchema.parse({
        telemetryIntervalSec: deviceToken.device.config?.telemetryIntervalSec,
        thresholds: deviceToken.device.config?.thresholds,
        timerMethod: deviceToken.device.config?.timerMethod
      })
    };
  }
}

export class PrismaHealthService implements HealthService {
  constructor(private readonly redis: RedisClient) {}

  async databaseHealth(): Promise<ServiceHealth> {
    try {
      await prisma.$queryRaw`SELECT 1`;
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

export class PrismaSensorIngestionService implements SensorIngestionService {
  async ingest(input: SensorIngestionInput): Promise<SensorIngestionResult> {
    const receivedAt = Math.floor(Date.now() / 1000);
    const notifications = evaluateRules(input, input.device.config);

    await prisma.device.update({
      where: {
        id: input.device.id
      },
      data: {
        lastSeenAt: new Date(receivedAt * 1000),
        status: "ACTIVE"
      }
    });

    await prisma.sensorSample.create({
      data: {
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
        ccs811Health: input.health.ccs811
      }
    });

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications.map((notification) => ({
          deviceId: input.device.id,
          userId: input.device.userId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          severity: notification.severity.toUpperCase() as "LOW" | "MEDIUM" | "HIGH"
        }))
      });
    }

    return {
      receivedAt,
      notifications
    };
  }
}

export class PrismaNotificationEventService implements NotificationEventService {
  async recordEvent(input: {
    deviceId: string;
    notificationId: string;
    action: "shown" | "acknowledged" | "dismissed";
  }): Promise<void> {
    await prisma.notificationEvent.create({
      data: {
        deviceId: input.deviceId,
        notificationId: input.notificationId,
        action: input.action
      }
    });

    if (input.action === "shown" || input.action === "acknowledged" || input.action === "dismissed") {
      const status = input.action === "shown" ? "SHOWN" : input.action === "acknowledged" ? "ACKNOWLEDGED" : "DISMISSED";
      await prisma.notification.update({
        where: {
          id: input.notificationId
        },
        data: {
          status,
          ...(input.action === "shown" ? { shownAt: new Date() } : {})
        }
      }).catch(() => undefined);
    }
  }
}
