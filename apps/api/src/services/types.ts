import type { DeviceConfig, NotificationSeverity } from "@kori/shared";

export type ServiceHealth = "up" | "down";

export interface RedisClient {
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  ping(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, durationSeconds: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

export interface DeviceRecord {
  id: string;
  hardwareId: string;
  userId: string;
  name: string;
  firmwareVersion: string;
  config: DeviceConfig;
}

export interface AuthenticatedDevice {
  id: string;
  userId: string;
  config: DeviceConfig;
}

export interface BootstrapResult {
  deviceId: string;
  deviceToken: string;
  wsUrl: string;
  config: DeviceConfig;
  serverTime: number;
}

export interface BootstrapService {
  bootstrap(input: {
    hardwareId: string;
    userApiKey: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult>;
}

export interface DeviceAuthService {
  authenticateToken(token: string): Promise<AuthenticatedDevice | null>;
}

export interface HealthService {
  databaseHealth(): Promise<ServiceHealth>;
  redisHealth(): Promise<ServiceHealth>;
}

export interface LiveStateService {
  getDeviceState(deviceId: string): Promise<Record<string, unknown> | null>;
  setDeviceState(deviceId: string, state: Record<string, unknown>): Promise<void>;
  removeDeviceSession(deviceId: string): Promise<void>;
  setDeviceSession(deviceId: string, state: Record<string, unknown>): Promise<void>;
}

export interface SensorIngestionInput {
  device: AuthenticatedDevice;
  eventTs?: number | undefined;
  sensors: {
    temp?: number;
    humidity?: number;
    pressure?: number;
    co2?: number;
    tvoc?: number;
    noise: number;
    light: number;
  };
  health: {
    wifi: string;
    bme280: string;
    ccs811: string;
  };
}

export interface RuleNotification {
  title: string;
  body: string;
  type: string;
  severity: NotificationSeverity;
}

export interface SensorIngestionResult {
  receivedAt: number;
  notifications: RuleNotification[];
}

export interface SensorIngestionService {
  ingest(input: SensorIngestionInput): Promise<SensorIngestionResult>;
}

export interface NotificationEventService {
  recordEvent(input: {
    deviceId: string;
    notificationId: string;
    action: "shown" | "acknowledged" | "dismissed";
  }): Promise<void>;
}
