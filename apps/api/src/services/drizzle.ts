import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createDbClient, schema } from "@kori/db";
import type { AuditEvent, DeviceConfig } from "@kori/shared";
import { deviceConfigSchema } from "@kori/shared";
import { randomUUID } from "node:crypto";
import { generateOpaqueToken, hashPassword, sha256, verifyPassword } from "../utils/crypto.js";
import { evaluateRules } from "./rules.js";
import type {
  AdminStreamEvent,
  AuthService,
  AuthSession,
  AuthUser,
  AuthenticatedDevice,
  BootstrapResult,
  BootstrapService,
  DeviceAuthService,
  DeviceRegistryRecord,
  DeviceRegistryService,
  HealthService,
  NotificationEventService,
  ProvisioningCodeService,
  RedisClient,
  SensorIngestionInput,
  SensorIngestionResult,
  SensorIngestionService,
  ServiceHealth,
  AuditService,
  ObservabilityService,
  WorkspaceMembership,
  WorkspaceService
} from "./types.js";

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function getDb() {
  return createDbClient();
}

function normalizeDeviceConfig(
  row?:
    | {
        telemetryIntervalSec: number;
        thresholds: unknown;
        timerMethod: string;
      }
    | null
) {
  return deviceConfigSchema.parse(
    row
      ? {
          telemetryIntervalSec: row.telemetryIntervalSec,
          thresholds: row.thresholds,
          timerMethod: row.timerMethod
        }
      : {}
  );
}

async function findWorkspaceForUser(userId: string): Promise<string | null> {
  const db = getDb();
  const membership = await db.query.workspaceMemberships.findFirst({
    where: eq(schema.workspaceMemberships.userId, userId)
  });

  return membership?.workspaceId ?? null;
}

async function listWorkspaceMembershipsForUser(userId: string): Promise<WorkspaceMembership[]> {
  const db = getDb();
  const memberships = await db
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      slug: schema.workspaces.slug,
      role: schema.workspaceMemberships.role,
      createdAt: schema.workspaces.createdAt,
      updatedAt: schema.workspaces.updatedAt
    })
    .from(schema.workspaceMemberships)
    .innerJoin(schema.workspaces, eq(schema.workspaceMemberships.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMemberships.userId, userId));

  return memberships.map((membership: (typeof memberships)[number]) => ({
    id: membership.id,
    name: membership.name,
    slug: membership.slug,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString()
  }));
}

async function buildAuthUser(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<AuthUser> {
  const workspaces = await listWorkspaceMembershipsForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    roles: [...new Set(workspaces.map((workspace) => workspace.role))],
    workspaces
  };
}

export class DrizzleProvisioningCodeService implements ProvisioningCodeService {
  async createCode(input: {
    workspaceId: string;
    userId: string;
    expiresInSec: number;
    label?: string;
  }): Promise<{ code: string; workspaceId: string; userId: string; expiresAt: string; label: string | null }> {
    const db = getDb();
    const rawCode = `kori_prov_${generateOpaqueToken(12)}`;
    const expiresAt = new Date(Date.now() + input.expiresInSec * 1000);
    await db.insert(schema.deviceProvisioningCodes).values({
      id: createId("prov"),
      codeHash: sha256(rawCode),
      workspaceId: input.workspaceId,
      userId: input.userId,
      expiresAt,
      label: input.label ?? null
    });

    return {
      code: rawCode,
      workspaceId: input.workspaceId,
      userId: input.userId,
      expiresAt: expiresAt.toISOString(),
      label: input.label ?? null
    };
  }

  async consumeCode(code: string): Promise<{ workspaceId: string; userId: string } | null> {
    const db = getDb();
    const match = await db.query.deviceProvisioningCodes.findFirst({
      where: and(
        eq(schema.deviceProvisioningCodes.codeHash, sha256(code)),
        isNull(schema.deviceProvisioningCodes.consumedAt),
        gt(schema.deviceProvisioningCodes.expiresAt, new Date())
      )
    });

    if (!match) {
      return null;
    }

    await db
      .update(schema.deviceProvisioningCodes)
      .set({ consumedAt: new Date() })
      .where(eq(schema.deviceProvisioningCodes.id, match.id));

    return {
      workspaceId: match.workspaceId,
      userId: match.userId
    };
  }
}

export class DrizzleAuthService implements AuthService, WorkspaceService {
  async register(input: {
    email: string;
    password: string;
    name?: string;
    workspaceName?: string;
  }): Promise<AuthSession> {
    const db = getDb();
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, input.email)
    });

    if (existing) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    const userId = createId("user");
    const workspaceId = createId("ws");
    const workspaceName = input.workspaceName ?? `${input.name ?? "Kori"} Workspace`;
    const workspaceSlug = workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);

    await db.insert(schema.users).values({
      id: userId,
      email: input.email,
      name: input.name ?? null,
      passwordHash: hashPassword(input.password)
    });

    await db.insert(schema.workspaces).values({
      id: workspaceId,
      name: workspaceName,
      slug: workspaceSlug
    });

    await db.insert(schema.workspaceMemberships).values({
      id: createId("wm"),
      userId,
      workspaceId,
      role: "workspace_admin"
    });

    await db.insert(schema.quotas).values({
      id: createId("quota"),
      workspaceId,
      storageMb: 1024,
      deviceLimit: 10,
      monthlyAiTokens: 0
    });

    const user = await buildAuthUser({
      id: userId,
      email: input.email,
      name: input.name ?? null
    });

    return this.createSession(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthSession | null> {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, input.email)
    });

    if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      return null;
    }

    return this.createSession(await buildAuthUser(user));
  }

  async getSession(token: string): Promise<AuthSession | null> {
    const db = getDb();
    const session = await db.query.sessions.findFirst({
      where: and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date()))
    });

    if (!session) {
      return null;
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, session.userId)
    });

    if (!user) {
      return null;
    }

    return {
      sessionToken: token,
      expiresAt: session.expiresAt.toISOString(),
      user: await buildAuthUser(user)
    };
  }

  async logout(token: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    return listWorkspaceMembershipsForUser(userId);
  }

  private async createSession(user: AuthUser): Promise<AuthSession> {
    const db = getDb();
    const sessionToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(schema.sessions).values({
      id: createId("sess"),
      tokenHash: sha256(sessionToken),
      expiresAt,
      userId: user.id
    });

    return {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      user
    };
  }
}

export class DrizzleDeviceService implements BootstrapService, DeviceAuthService, DeviceRegistryService {
  constructor(private readonly provisioningCodeService: ProvisioningCodeService) {}

  async bootstrap(input: {
    hardwareId: string;
    userApiKey?: string;
    provisioningCode?: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult> {
    const db = getDb();
    let principal: { userId: string; workspaceId: string | null } | null = null;

    if (input.provisioningCode) {
      const consumed = await this.provisioningCodeService.consumeCode(input.provisioningCode);
      if (consumed) {
        principal = consumed;
      }
    }

    if (!principal && input.userApiKey) {
      const apiKey = await db.query.userApiKeys.findFirst({
        columns: {
          id: true,
          userId: true
        },
        where: and(
          eq(schema.userApiKeys.keyHash, sha256(input.userApiKey)),
          eq(schema.userApiKeys.isActive, true)
        )
      });

      if (apiKey) {
        principal = {
          userId: apiKey.userId,
          workspaceId: await findWorkspaceForUser(apiKey.userId)
        };

        await db
          .update(schema.userApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(schema.userApiKeys.id, apiKey.id));
      }
    }

    if (!principal) {
      throw new Error("INVALID_DEVICE_BOOTSTRAP_CREDENTIAL");
    }

    const defaultConfig = deviceConfigSchema.parse({});
    let device = await db.query.devices.findFirst({
      where: eq(schema.devices.hardwareId, input.hardwareId)
    });

    if (!device) {
      const newDeviceId = createId("dev");
      await db.insert(schema.devices).values({
        id: newDeviceId,
        hardwareId: input.hardwareId,
        name: input.deviceName,
        firmwareVersion: input.firmwareVersion,
        status: "ACTIVE",
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        lastSeenAt: new Date(),
        protocolVersion: "2026-04-16",
        lastKnownServerTime: Math.floor(Date.now() / 1000)
      });

      await db.insert(schema.deviceConfigs).values({
        id: createId("cfg"),
        deviceId: newDeviceId,
        telemetryIntervalSec: defaultConfig.telemetryIntervalSec,
        thresholds: defaultConfig.thresholds,
        timerMethod: defaultConfig.timerMethod
      });

      device = await db.query.devices.findFirst({
        where: eq(schema.devices.id, newDeviceId)
      });
    } else {
      await db
        .update(schema.devices)
        .set({
          name: input.deviceName,
          firmwareVersion: input.firmwareVersion,
          status: "ACTIVE",
          workspaceId: device.workspaceId ?? principal.workspaceId,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          lastKnownServerTime: Math.floor(Date.now() / 1000)
        })
        .where(eq(schema.devices.id, device.id));
    }

    if (!device) {
      throw new Error("DEVICE_BOOTSTRAP_FAILED");
    }

    const existingConfig = await db.query.deviceConfigs.findFirst({
      where: eq(schema.deviceConfigs.deviceId, device.id)
    });

    if (!existingConfig) {
      await db.insert(schema.deviceConfigs).values({
        id: createId("cfg"),
        deviceId: device.id,
        telemetryIntervalSec: defaultConfig.telemetryIntervalSec,
        thresholds: defaultConfig.thresholds,
        timerMethod: defaultConfig.timerMethod
      });
    }

    await db
      .update(schema.deviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.deviceTokens.deviceId, device.id), isNull(schema.deviceTokens.revokedAt)));

    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(schema.deviceTokens).values({
      id: createId("dtok"),
      tokenHash: sha256(rawToken),
      deviceId: device.id,
      expiresAt
    });

    const config = normalizeDeviceConfig(
      existingConfig ??
        (await db.query.deviceConfigs.findFirst({
          where: eq(schema.deviceConfigs.deviceId, device.id)
        }))
    );

    return {
      deviceId: device.id,
      deviceToken: rawToken,
      wsUrl: input.wsUrl,
      config,
      serverTime: Math.floor(Date.now() / 1000),
      protocolVersion: device.protocolVersion
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
    const db = getDb();
    const row = await db
      .select({
        deviceId: schema.devices.id,
        userId: schema.devices.userId,
        workspaceId: schema.devices.workspaceId,
        telemetryIntervalSec: schema.deviceConfigs.telemetryIntervalSec,
        thresholds: schema.deviceConfigs.thresholds,
        timerMethod: schema.deviceConfigs.timerMethod,
        tokenId: schema.deviceTokens.id
      })
      .from(schema.deviceTokens)
      .innerJoin(schema.devices, eq(schema.deviceTokens.deviceId, schema.devices.id))
      .leftJoin(schema.deviceConfigs, eq(schema.deviceConfigs.deviceId, schema.devices.id))
      .where(
        and(
          eq(schema.deviceTokens.tokenHash, sha256(token)),
          isNull(schema.deviceTokens.revokedAt),
          or(isNull(schema.deviceTokens.expiresAt), gt(schema.deviceTokens.expiresAt, new Date()))
        )
      )
      .limit(1);

    const match = row[0];
    if (!match) {
      return null;
    }

    await db
      .update(schema.deviceTokens)
      .set({ lastValidatedAt: new Date() })
      .where(eq(schema.deviceTokens.id, match.tokenId));

    return {
      id: match.deviceId,
      userId: match.userId,
      workspaceId: match.workspaceId ?? null,
      config: normalizeDeviceConfig({
        telemetryIntervalSec: match.telemetryIntervalSec ?? 2,
        thresholds: match.thresholds ?? undefined,
        timerMethod: match.timerMethod ?? "pomodoro"
      })
    };
  }

  async listDevices(): Promise<DeviceRegistryRecord[]> {
    const db = getDb();
    const devices = await db.query.devices.findMany({
      orderBy: desc(schema.devices.updatedAt)
    });

    return devices.map((device: (typeof devices)[number]) => ({
      id: device.id,
      hardwareId: device.hardwareId,
      userId: device.userId,
      workspaceId: device.workspaceId ?? null,
      name: device.name,
      firmwareVersion: device.firmwareVersion,
      protocolVersion: device.protocolVersion,
      status: device.status,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null
    }));
  }

  async rotateToken(input: { deviceId: string }): Promise<{ token: string; expiresAt: string; rotatedAt: string }> {
    const db = getDb();
    await db
      .update(schema.deviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.deviceTokens.deviceId, input.deviceId), isNull(schema.deviceTokens.revokedAt)));

    const rawToken = generateOpaqueToken();
    const rotatedAt = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(schema.deviceTokens).values({
      id: createId("dtok"),
      deviceId: input.deviceId,
      tokenHash: sha256(rawToken),
      expiresAt
    });

    return {
      token: rawToken,
      rotatedAt: rotatedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  async getDeviceConfig(deviceId: string): Promise<DeviceConfig> {
    const db = getDb();
    const config = await db.query.deviceConfigs.findFirst({
      where: eq(schema.deviceConfigs.deviceId, deviceId)
    });

    return normalizeDeviceConfig(config);
  }
}

export class DrizzleAuditService implements AuditService {
  constructor(private readonly observabilityService?: ObservabilityService) {}

  async record(event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<AuditEvent> {
    const db = getDb();
    const createdAt = event.createdAt ? new Date(event.createdAt) : new Date();
    const id = createId("audit");
    await db.insert(schema.auditLogs).values({
      id,
      action: event.action,
      actorType: event.actorType,
      actorId: event.actorId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
      createdAt,
      workspaceId: event.workspaceId,
      userId: event.userId
    });

    const auditEvent = {
      ...event,
      id,
      createdAt: createdAt.toISOString()
    };

    if (this.observabilityService) {
      await this.observabilityService.publish({
        type: "admin:audit",
        payload: auditEvent
      } satisfies AdminStreamEvent);
    }

    return auditEvent;
  }

  async listRecent(limit = 50): Promise<AuditEvent[]> {
    const db = getDb();
    const rows = await db.query.auditLogs.findMany({
      orderBy: desc(schema.auditLogs.createdAt),
      limit
    });

    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId ?? null,
      workspaceId: row.workspaceId ?? null,
      userId: row.userId ?? null,
      resourceType: row.resourceType,
      resourceId: row.resourceId ?? null,
      createdAt: row.createdAt.toISOString(),
      metadata: row.metadata
    }));
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
        lastKnownServerTime: receivedAt
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
      ccs811Health: input.health.ccs811
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
          severity: notification.severity.toUpperCase() as "LOW" | "MEDIUM" | "HIGH"
        }))
      );
    }

    return {
      receivedAt,
      notifications
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
      action: input.action
    });

    await db
      .update(schema.notifications)
      .set({
        status: input.action === "shown" ? "SHOWN" : input.action === "acknowledged" ? "ACKNOWLEDGED" : "DISMISSED",
        updatedAt: new Date(),
        ...(input.action === "shown" ? { shownAt: new Date() } : {})
      })
      .where(eq(schema.notifications.id, input.notificationId));
  }
}
