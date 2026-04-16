import type {
  AuthSessionResponse,
  AuthUser as SharedAuthUser,
  AuditEvent,
  Deadline,
  DeviceConfig,
  DeviceLiveState,
  DeveloperLogEvent,
  Note,
  NoteRevision,
  NotificationSeverity,
  Recommendation,
  SpotifyPresence,
  TelemetryBucket,
  TelemetryLatest,
  Workspace,
  WorkspaceRole
} from "@kori/shared";

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
  workspaceId: string | null;
  name: string;
  firmwareVersion: string;
  protocolVersion: string;
  config: DeviceConfig;
}

export interface DeviceRegistryRecord {
  id: string;
  hardwareId: string;
  userId: string;
  workspaceId: string | null;
  name: string;
  firmwareVersion: string;
  protocolVersion: string;
  status: "PENDING" | "ACTIVE" | "OFFLINE";
  lastSeenAt: string | null;
}

export interface AuthenticatedDevice {
  id: string;
  userId: string;
  workspaceId: string | null;
  config: DeviceConfig;
}

export interface BootstrapResult {
  deviceId: string;
  deviceToken: string;
  wsUrl: string;
  config: DeviceConfig;
  serverTime: number;
  protocolVersion: string;
}

export interface BootstrapService {
  bootstrap(input: {
    hardwareId: string;
    userApiKey?: string;
    provisioningCode?: string;
    deviceName: string;
    firmwareVersion: string;
    wsUrl: string;
  }): Promise<BootstrapResult>;
}

export interface DeviceAuthService {
  authenticateToken(token: string): Promise<AuthenticatedDevice | null>;
}

export interface DeviceRegistryService {
  listDevices(): Promise<DeviceRegistryRecord[]>;
  rotateToken(input: { deviceId: string }): Promise<{ token: string; expiresAt: string; rotatedAt: string }>;
  getDeviceConfig(deviceId: string): Promise<DeviceConfig>;
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

export interface ProvisioningCodeService {
  createCode(input: {
    workspaceId: string;
    userId: string;
    expiresInSec: number;
    label?: string;
  }): Promise<{ code: string; workspaceId: string; userId: string; expiresAt: string; label: string | null }>;
  consumeCode(code: string): Promise<{ workspaceId: string; userId: string } | null>;
}

export interface AuditService {
  record(event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<AuditEvent>;
  listRecent(limit?: number): Promise<AuditEvent[]>;
}

export interface ObservabilityService {
  log(event: Omit<DeveloperLogEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<DeveloperLogEvent>;
  listLogs(limit?: number): Promise<DeveloperLogEvent[]>;
  publish(event: AdminStreamEvent): Promise<void>;
  setDeviceState(state: DeviceLiveState): Promise<void>;
  removeDeviceState(deviceId: string): Promise<void>;
  listDeviceStates(): Promise<DeviceLiveState[]>;
  setSpotifyPresence(presence: SpotifyPresence): Promise<void>;
  listSpotifyPresence(): Promise<SpotifyPresence[]>;
  subscribe(listener: (event: AdminStreamEvent) => void): () => void;
}

export interface SpotifyConnectionStatus {
  connected: boolean;
  userId: string;
  spotifyUserId: string | null;
  scopes: string[];
  lastSyncedAt: string | null;
  presence: SpotifyPresence | null;
}

export interface SpotifyService {
  getAuthorizationUrl(userId: string): Promise<string>;
  handleCallback(input: { userId: string; code: string }): Promise<SpotifyConnectionStatus>;
  disconnect(userId: string): Promise<void>;
  getStatus(userId: string): Promise<SpotifyConnectionStatus>;
  refreshPresence(userId: string): Promise<SpotifyPresence | null>;
}

export interface AdminSession {
  role: Extract<WorkspaceRole, "platform_admin" | "workspace_admin">;
  actorId: string;
}

export interface AdminStreamEvent {
  type: "admin:log" | "admin:device_state" | "admin:audit" | "admin:spotify_presence" | "admin:overview";
  payload: DeveloperLogEvent | DeviceLiveState | AuditEvent | SpotifyPresence | Record<string, unknown>;
}

export type AuthUser = SharedAuthUser;
export type AuthSession = AuthSessionResponse;
export type WorkspaceMembership = Workspace;

export interface AuthService {
  register(input: {
    email: string;
    password: string;
    name?: string;
    workspaceName?: string;
  }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession | null>;
  getSession(token: string): Promise<AuthSession | null>;
  logout(token: string): Promise<void>;
}

export interface WorkspaceService {
  listForUser(userId: string): Promise<WorkspaceMembership[]>;
}

export interface NotesService {
  listNotes(input: { userId: string }): Promise<Note[]>;
  createNote(input: {
    workspaceId: string;
    userId: string;
    title: string;
    type: "markdown" | "txt" | "latex" | "mermaid" | "drawing";
    content: string;
  }): Promise<Note>;
  listRevisions(noteId: string): Promise<NoteRevision[]>;
  createRevision(input: { noteId: string; userId: string; content: string }): Promise<NoteRevision>;
}

export interface DeadlinesService {
  listDeadlines(input: { userId: string }): Promise<Deadline[]>;
  createDeadline(input: {
    workspaceId: string;
    userId: string;
    title: string;
    dueAt: string;
    metadata: Record<string, unknown>;
  }): Promise<Deadline>;
}

export interface RecommendationsService {
  listRecommendations(input: { userId: string }): Promise<Recommendation[]>;
  createRecommendation(input: {
    workspaceId: string;
    userId?: string;
    type: string;
    title: string;
    body: string;
  }): Promise<Recommendation>;
}

export interface TelemetryService {
  getOverview(input: { hours: number; bucketMinutes: number }): Promise<{
    buckets: TelemetryBucket[];
    latest: TelemetryLatest[];
  }>;
  enableTimescaleSupport(): Promise<{ enabled: boolean; message: string }>;
}
