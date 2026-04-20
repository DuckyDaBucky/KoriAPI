import type {
  AuthSessionResponse,
  AuthUser as SharedAuthUser,
  AuditEvent,
  ConnectorConfig,
  ConnectorRun,
  Deadline,
  DeviceConfig,
  DeviceLiveState,
  DeveloperLogEvent,
  Invitation,
  JobStatus,
  MfaFactor,
  Note,
  NoteRevision,
  NotificationSeverity,
  QuotaUsage,
  Recommendation,
  SpotifyPresence,
  TelemetryBucket,
  TelemetryLatest,
  TemporalEvent,
  TemporalSignal,
  ServiceToken,
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
  listLogs(input?: {
    limit?: number;
    level?: DeveloperLogEvent["level"];
    route?: string;
    workspaceId?: string;
    userId?: string;
    deviceId?: string;
    requestId?: string;
    integration?: string;
  }): Promise<DeveloperLogEvent[]>;
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
  workspaceIds: string[];
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

export interface SecurityService {
  listMfaFactors(userId: string): Promise<MfaFactor[]>;
  enrollTotp(input: {
    userId: string;
    email: string;
    label?: string;
  }): Promise<{ factor: MfaFactor; secret: string; otpauthUrl: string; backupCodes: string[] }>;
  verifyMfaFactor(input: { userId: string; factorId: string; code: string }): Promise<boolean>;
  disableMfaFactor(input: { userId: string; factorId: string }): Promise<boolean>;
  listInvitations(input: { workspaceIds?: string[] }): Promise<Invitation[]>;
  createInvitation(input: {
    email: string;
    workspaceId: string;
    role: Extract<WorkspaceRole, "workspace_admin" | "member" | "service">;
    expiresInSec: number;
    invitedByUserId?: string | null;
  }): Promise<{ invitation: Invitation; token: string }>;
  acceptInvitation(input: { userId: string; userEmail: string; token: string }): Promise<Invitation | null>;
  listServiceTokens(input: { workspaceIds?: string[] }): Promise<ServiceToken[]>;
  createServiceToken(input: {
    workspaceId?: string;
    label: string;
  }): Promise<{ serviceToken: ServiceToken; rawToken: string }>;
  revokeServiceToken(id: string): Promise<boolean>;
}

export interface WorkspaceService {
  listForUser(userId: string): Promise<WorkspaceMembership[]>;
}

export interface ConnectorsService {
  listConfigs(input: { workspaceIds?: string[] }): Promise<ConnectorConfig[]>;
  upsertConfig(input: {
    workspaceId: string;
    provider: string;
    config: Record<string, unknown>;
  }): Promise<ConnectorConfig>;
  listRuns(input: { workspaceIds?: string[]; limit?: number }): Promise<ConnectorRun[]>;
  triggerRun(input: { workspaceId: string; provider: string; triggeredBy?: string | null }): Promise<ConnectorRun>;
}

export interface JobsService {
  listJobs(limit?: number): Promise<JobStatus[]>;
  enqueue(input: {
    kind: string;
    workspaceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<JobStatus>;
}

export interface QuotasService {
  listUsage(input?: { workspaceIds?: string[] }): Promise<QuotaUsage[]>;
}

export interface TemporalService {
  listEvents(limit?: number): Promise<TemporalEvent[]>;
  listSignals(limit?: number): Promise<TemporalSignal[]>;
  recordEvent(input: {
    type: string;
    workspaceId?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<TemporalEvent>;
}

export interface NotesService {
  listNotes(input: { userId: string }): Promise<Note[]>;
  getNote(input: { userId: string; noteId: string }): Promise<Note | null>;
  createNote(input: {
    workspaceId: string;
    userId: string;
    title: string;
    type: "markdown" | "txt" | "latex" | "mermaid" | "drawing";
    content: string;
  }): Promise<Note>;
  updateNote(input: {
    userId: string;
    noteId: string;
    title?: string;
    type?: "markdown" | "txt" | "latex" | "mermaid" | "drawing";
    content?: string;
  }): Promise<Note | null>;
  deleteNote(input: { userId: string; noteId: string }): Promise<boolean>;
  listRevisions(input: { userId: string; noteId: string }): Promise<NoteRevision[]>;
  createRevision(input: { noteId: string; userId: string; content: string }): Promise<NoteRevision>;
}

export interface DeadlinesService {
  listDeadlines(input: { userId: string }): Promise<Deadline[]>;
  getDeadline(input: { userId: string; deadlineId: string }): Promise<Deadline | null>;
  createDeadline(input: {
    workspaceId: string;
    userId: string;
    title: string;
    dueAt: string;
    metadata: Record<string, unknown>;
  }): Promise<Deadline>;
  updateDeadline(input: {
    userId: string;
    deadlineId: string;
    title?: string;
    dueAt?: string;
    status?: Deadline["status"];
    metadata?: Record<string, unknown>;
  }): Promise<Deadline | null>;
  deleteDeadline(input: { userId: string; deadlineId: string }): Promise<boolean>;
}

export interface RecommendationsService {
  listRecommendations(input: { userId: string }): Promise<Recommendation[]>;
  getRecommendation(input: { userId: string; recommendationId: string }): Promise<Recommendation | null>;
  createRecommendation(input: {
    workspaceId: string;
    userId?: string;
    type: string;
    title: string;
    body: string;
  }): Promise<Recommendation>;
  updateRecommendation(input: {
    userId: string;
    recommendationId: string;
    type?: string;
    title?: string;
    body?: string;
    deliveredAt?: string | null;
  }): Promise<Recommendation | null>;
  deleteRecommendation(input: { userId: string; recommendationId: string }): Promise<boolean>;
}

export interface TelemetryService {
  getOverview(input: { hours: number; bucketMinutes: number }): Promise<{
    buckets: TelemetryBucket[];
    latest: TelemetryLatest[];
  }>;
  enableTimescaleSupport(): Promise<{ enabled: boolean; message: string }>;
}
