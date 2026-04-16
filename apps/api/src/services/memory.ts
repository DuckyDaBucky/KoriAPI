import { deviceConfigSchema } from "@kori/shared";
import { evaluateRules } from "./rules.js";
import type {
  AuthenticatedDevice,
  BootstrapResult,
  BootstrapService,
  DeviceAuthService,
  DeviceRecord,
  DeviceRegistryRecord,
  DeviceRegistryService,
  HealthService,
  LiveStateService,
  NotificationEventService,
  ProvisioningCodeService,
  SensorIngestionInput,
  SensorIngestionResult,
  SensorIngestionService,
  ServiceHealth,
  SpotifyConnectionStatus,
  SpotifyService
} from "./types.js";
import { generateOpaqueToken } from "../utils/crypto.js";

type DeviceEntry = DeviceRecord & {
  token: string;
  status: "PENDING" | "ACTIVE" | "OFFLINE";
  lastSeenAt: string | null;
};

type ProvisioningEntry = {
  workspaceId: string;
  userId: string;
  expiresAt: string;
  label: string | null;
  consumed: boolean;
};

export class MemoryBootstrapService
  implements BootstrapService, DeviceAuthService, DeviceRegistryService, ProvisioningCodeService
{
  private readonly devices = new Map<string, DeviceEntry>();
  private readonly tokens = new Map<string, string>();
  private readonly validApiKeys = new Map<string, { userId: string; workspaceId: string }>();
  private readonly provisioningCodes = new Map<string, ProvisioningEntry>();

  constructor() {
    this.validApiKeys.set("dev-user-api-key", { userId: "user_dev", workspaceId: "ws_dev" });
  }

  async bootstrap(input: {
    hardwareId: string;
    userApiKey?: string;
    provisioningCode?: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult> {
    let principal = input.userApiKey ? this.validApiKeys.get(input.userApiKey) ?? null : null;

    if (!principal && input.provisioningCode) {
      principal = await this.consumeCode(input.provisioningCode);
    }

    if (!principal) {
      throw new Error("INVALID_DEVICE_BOOTSTRAP_CREDENTIAL");
    }

    const config = deviceConfigSchema.parse({});
    const existing = this.devices.get(input.hardwareId);
    const token = generateOpaqueToken();
    const device: DeviceEntry = existing ?? {
      id: `dev_${this.devices.size + 1}`,
      hardwareId: input.hardwareId,
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      name: input.deviceName,
      firmwareVersion: input.firmwareVersion,
      protocolVersion: "2026-04-16",
      config,
      token,
      status: "ACTIVE",
      lastSeenAt: new Date().toISOString()
    };

    device.name = input.deviceName;
    device.firmwareVersion = input.firmwareVersion;
    device.token = token;
    device.status = "ACTIVE";
    device.lastSeenAt = new Date().toISOString();
    this.devices.set(input.hardwareId, device);
    this.tokens.set(token, device.id);

    return {
      deviceId: device.id,
      deviceToken: token,
      wsUrl: input.wsUrl,
      config: device.config,
      serverTime: Math.floor(Date.now() / 1000),
      protocolVersion: device.protocolVersion
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedDevice | null> {
    const deviceId = this.tokens.get(token);
    if (!deviceId) {
      return null;
    }

    for (const device of this.devices.values()) {
      if (device.id === deviceId && device.token === token) {
        device.lastSeenAt = new Date().toISOString();
        return {
          id: device.id,
          userId: device.userId,
          workspaceId: device.workspaceId,
          config: device.config
        };
      }
    }

    return null;
  }

  async listDevices(): Promise<DeviceRegistryRecord[]> {
    return [...this.devices.values()].map((device) => ({
      id: device.id,
      hardwareId: device.hardwareId,
      userId: device.userId,
      workspaceId: device.workspaceId,
      name: device.name,
      firmwareVersion: device.firmwareVersion,
      protocolVersion: device.protocolVersion,
      status: device.status,
      lastSeenAt: device.lastSeenAt
    }));
  }

  async rotateToken(input: { deviceId: string }): Promise<{ token: string; expiresAt: string; rotatedAt: string }> {
    for (const device of this.devices.values()) {
      if (device.id !== input.deviceId) {
        continue;
      }

      const token = generateOpaqueToken();
      device.token = token;
      this.tokens.set(token, device.id);
      const rotatedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return {
        token,
        expiresAt,
        rotatedAt
      };
    }

    throw new Error("DEVICE_NOT_FOUND");
  }

  async getDeviceConfig(deviceId: string) {
    for (const device of this.devices.values()) {
      if (device.id === deviceId) {
        return device.config;
      }
    }

    throw new Error("DEVICE_NOT_FOUND");
  }

  async createCode(input: {
    workspaceId: string;
    userId: string;
    expiresInSec: number;
    label?: string;
  }): Promise<{ code: string; workspaceId: string; userId: string; expiresAt: string; label: string | null }> {
    const code = `kori_prov_${generateOpaqueToken(12)}`;
    const expiresAt = new Date(Date.now() + input.expiresInSec * 1000).toISOString();
    this.provisioningCodes.set(code, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      expiresAt,
      label: input.label ?? null,
      consumed: false
    });

    return {
      code,
      workspaceId: input.workspaceId,
      userId: input.userId,
      expiresAt,
      label: input.label ?? null
    };
  }

  async consumeCode(code: string): Promise<{ workspaceId: string; userId: string } | null> {
    const match = this.provisioningCodes.get(code);
    if (!match || match.consumed || Date.parse(match.expiresAt) < Date.now()) {
      return null;
    }

    match.consumed = true;
    return {
      workspaceId: match.workspaceId,
      userId: match.userId
    };
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

export class MemorySpotifyService implements SpotifyService {
  private readonly statusByUserId = new Map<string, SpotifyConnectionStatus>();

  async getAuthorizationUrl(userId: string): Promise<string> {
    return `https://example.test/spotify/connect?userId=${encodeURIComponent(userId)}`;
  }

  async handleCallback(input: { userId: string; code: string }): Promise<SpotifyConnectionStatus> {
    const status: SpotifyConnectionStatus = {
      connected: true,
      userId: input.userId,
      spotifyUserId: `spotify_${input.userId}`,
      scopes: ["user-read-currently-playing", "user-read-playback-state"],
      lastSyncedAt: new Date().toISOString(),
      presence: {
        userId: input.userId,
        isPlaying: true,
        trackId: input.code,
        trackName: "Test Track",
        artistNames: ["Kori"],
        albumName: "Test Album",
        startedAt: new Date().toISOString(),
        progressMs: 120000,
        deviceName: "Memory Device",
        observedAt: new Date().toISOString(),
        source: "manual"
      }
    };
    this.statusByUserId.set(input.userId, status);
    return status;
  }

  async disconnect(userId: string): Promise<void> {
    this.statusByUserId.delete(userId);
  }

  async getStatus(userId: string): Promise<SpotifyConnectionStatus> {
    return (
      this.statusByUserId.get(userId) ?? {
        connected: false,
        userId,
        spotifyUserId: null,
        scopes: [],
        lastSyncedAt: null,
        presence: null
      }
    );
  }

  async refreshPresence(userId: string) {
    const status = await this.getStatus(userId);
    return status.presence;
  }
}
