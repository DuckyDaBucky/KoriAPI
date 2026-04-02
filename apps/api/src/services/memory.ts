import { deviceConfigSchema } from "@kori/shared";
import { evaluateRules } from "./rules.js";
import type {
  AuthenticatedDevice,
  BootstrapResult,
  BootstrapService,
  DeviceAuthService,
  DeviceRecord,
  HealthService,
  LiveStateService,
  NotificationEventService,
  SensorIngestionInput,
  SensorIngestionResult,
  SensorIngestionService,
  ServiceHealth
} from "./types.js";
import { generateOpaqueToken } from "../utils/crypto.js";

type DeviceEntry = DeviceRecord & {
  token: string;
};

export class MemoryBootstrapService implements BootstrapService, DeviceAuthService {
  private readonly devices = new Map<string, DeviceEntry>();
  private readonly tokens = new Map<string, string>();
  private readonly validApiKeys = new Map<string, { userId: string }>();

  constructor() {
    this.validApiKeys.set("dev-user-api-key", { userId: "user_dev" });
  }

  async bootstrap(input: {
    hardwareId: string;
    userApiKey: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult> {
    const user = this.validApiKeys.get(input.userApiKey);
    if (!user) {
      throw new Error("INVALID_USER_API_KEY");
    }

    const config = deviceConfigSchema.parse({});
    const existing = this.devices.get(input.hardwareId);
    const token = generateOpaqueToken();
    const device: DeviceEntry = existing ?? {
      id: `dev_${this.devices.size + 1}`,
      hardwareId: input.hardwareId,
      userId: user.userId,
      name: input.deviceName,
      firmwareVersion: input.firmwareVersion,
      config,
      token
    };

    device.name = input.deviceName;
    device.firmwareVersion = input.firmwareVersion;
    device.token = token;
    this.devices.set(input.hardwareId, device);
    this.tokens.set(token, device.id);

    return {
      deviceId: device.id,
      deviceToken: token,
      wsUrl: input.wsUrl,
      config: device.config,
      serverTime: Math.floor(Date.now() / 1000)
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
    const deviceId = this.tokens.get(token);
    if (!deviceId) {
      return null;
    }

    for (const device of this.devices.values()) {
      if (device.id === deviceId && device.token === token) {
        return {
          id: device.id,
          userId: device.userId,
          config: device.config
        };
      }
    }

    return null;
  }
}

export class MemoryHealthService implements HealthService {
  async databaseHealth(): Promise<ServiceHealth> {
    return "up";
  }

  async redisHealth(): Promise<ServiceHealth> {
    return "up";
  }
}

export class MemoryLiveStateService implements LiveStateService {
  readonly state = new Map<string, Record<string, unknown>>();
  readonly sessions = new Map<string, Record<string, unknown>>();

  async getDeviceState(deviceId: string): Promise<Record<string, unknown> | null> {
    return this.state.get(deviceId) ?? null;
  }

  async setDeviceState(deviceId: string, state: Record<string, unknown>): Promise<void> {
    this.state.set(deviceId, state);
  }

  async removeDeviceSession(deviceId: string): Promise<void> {
    this.sessions.delete(deviceId);
  }

  async setDeviceSession(deviceId: string, state: Record<string, unknown>): Promise<void> {
    this.sessions.set(deviceId, state);
  }
}

export class MemorySensorIngestionService implements SensorIngestionService {
  async ingest(input: SensorIngestionInput): Promise<SensorIngestionResult> {
    return {
      receivedAt: Math.floor(Date.now() / 1000),
      notifications: evaluateRules(input, input.device.config)
    };
  }
}

export class MemoryNotificationEventService implements NotificationEventService {
  readonly events: Array<{ deviceId: string; notificationId: string; action: string }> = [];

  async recordEvent(input: {
    deviceId: string;
    notificationId: string;
    action: "shown" | "acknowledged" | "dismissed";
  }): Promise<void> {
    this.events.push(input);
  }
}
