import { deviceConfigSchema } from "@kori/shared";
import { evaluateRules } from "./rules.js";
import type {
  AuthService,
  AuthSession,
  AuthUser,
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
  NotesService,
  ProvisioningCodeService,
  RecommendationsService,
  SensorIngestionInput,
  SensorIngestionResult,
  SensorIngestionService,
  ServiceHealth,
  SpotifyConnectionStatus,
  SpotifyService,
  TelemetryService,
  WorkspaceMembership,
  WorkspaceService,
  DeadlinesService
} from "./types.js";
import { generateOpaqueToken, hashPassword, verifyPassword } from "../utils/crypto.js";

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

type MemoryUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
};

type MemorySensorSample = {
  deviceId: string;
  receivedAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  co2Ppm: number | null;
  tvocPpb: number | null;
  noisePct: number;
  lightPct: number;
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

export class MemoryAuthService implements AuthService, WorkspaceService {
  private readonly users = new Map<string, MemoryUser>();
  private readonly usersByEmail = new Map<string, MemoryUser>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: string }>();
  private readonly memberships = new Map<string, WorkspaceMembership[]>();

  constructor() {
    const user: MemoryUser = {
      id: "user_dev",
      email: "owner@example.com",
      name: "Kori Owner",
      passwordHash: hashPassword("ChangeMe123!")
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    this.memberships.set(user.id, [
      {
        id: "ws_dev",
        name: "Kori Default Workspace",
        slug: "kori-default-workspace",
        role: "platform_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
  }

  async register(input: {
    email: string;
    password: string;
    name?: string;
    workspaceName?: string;
  }): Promise<AuthSession> {
    if (this.usersByEmail.has(input.email)) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    const user: MemoryUser = {
      id: `user_${this.users.size + 1}`,
      email: input.email,
      name: input.name ?? null,
      passwordHash: hashPassword(input.password)
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    this.memberships.set(user.id, [
      {
        id: `ws_${this.users.size}`,
        name: input.workspaceName ?? `${input.name ?? "Kori"} Workspace`,
        slug: `workspace-${this.users.size}`,
        role: "workspace_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    return this.createSession(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthSession | null> {
    const user = this.usersByEmail.get(input.email);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      return null;
    }

    return this.createSession(user);
  }

  async getSession(token: string): Promise<AuthSession | null> {
    const session = this.sessions.get(token);
    if (!session || Date.parse(session.expiresAt) < Date.now()) {
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user) {
      return null;
    }

    return {
      sessionToken: token,
      expiresAt: session.expiresAt,
      user: this.toAuthUser(user)
    };
  }

  async logout(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    return this.memberships.get(userId) ?? [];
  }

  private createSession(user: MemoryUser): AuthSession {
    const sessionToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.sessions.set(sessionToken, {
      userId: user.id,
      expiresAt
    });

    return {
      sessionToken,
      expiresAt,
      user: this.toAuthUser(user)
    };
  }

  private toAuthUser(user: MemoryUser): AuthUser {
    const workspaces = this.memberships.get(user.id) ?? [];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: [...new Set(workspaces.map((workspace) => workspace.role))],
      workspaces
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
  readonly samples: MemorySensorSample[] = [];

  async ingest(input: SensorIngestionInput): Promise<SensorIngestionResult> {
    const receivedAt = Math.floor(Date.now() / 1000);
    this.samples.unshift({
      deviceId: input.device.id,
      receivedAt: new Date(receivedAt * 1000).toISOString(),
      temperatureC: input.sensors.temp ?? null,
      humidityPct: input.sensors.humidity ?? null,
      pressureHpa: input.sensors.pressure ?? null,
      co2Ppm: input.sensors.co2 ?? null,
      tvocPpb: input.sensors.tvoc ?? null,
      noisePct: input.sensors.noise,
      lightPct: input.sensors.light
    });
    this.samples.splice(1000);

    return {
      receivedAt,
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

export class MemoryNotesService implements NotesService {
  private readonly notes = new Map<string, Array<Awaited<ReturnType<NotesService["createNote"]>>>>();
  private readonly revisions = new Map<string, Array<Awaited<ReturnType<NotesService["createRevision"]>>>>();

  async listNotes(input: { userId: string }) {
    return this.notes.get(input.userId) ?? [];
  }

  async getNote(input: { userId: string; noteId: string }) {
    return (this.notes.get(input.userId) ?? []).find((note) => note.id === input.noteId) ?? null;
  }

  async createNote(input: {
    workspaceId: string;
    userId: string;
    title: string;
    type: "markdown" | "txt" | "latex" | "mermaid" | "drawing";
    content: string;
  }) {
    const note = {
      id: `note_${Date.now()}`,
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      type: input.type,
      content: input.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as const;
    const existing = this.notes.get(input.userId) ?? [];
    this.notes.set(input.userId, [note, ...existing]);
    this.revisions.set(note.id, [
      {
        id: `rev_${Date.now()}`,
        noteId: note.id,
        content: note.content,
        userId: input.userId,
        createdAt: note.createdAt
      }
    ]);
    return note;
  }

  async updateNote(input: {
    userId: string;
    noteId: string;
    title?: string;
    type?: "markdown" | "txt" | "latex" | "mermaid" | "drawing";
    content?: string;
  }) {
    const notes = this.notes.get(input.userId) ?? [];
    const existing = notes.find((note) => note.id === input.noteId);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      updatedAt: new Date().toISOString()
    };

    this.notes.set(
      input.userId,
      notes.map((note) => (note.id === input.noteId ? updated : note))
    );

    if (input.content !== undefined) {
      const revisions = this.revisions.get(input.noteId) ?? [];
      this.revisions.set(input.noteId, [
        {
          id: `rev_${Date.now()}`,
          noteId: input.noteId,
          content: input.content,
          userId: input.userId,
          createdAt: updated.updatedAt
        },
        ...revisions
      ]);
    }

    return updated;
  }

  async deleteNote(input: { userId: string; noteId: string }) {
    const notes = this.notes.get(input.userId) ?? [];
    const next = notes.filter((note) => note.id !== input.noteId);
    if (next.length === notes.length) {
      return false;
    }

    this.notes.set(input.userId, next);
    this.revisions.delete(input.noteId);
    return true;
  }

  async listRevisions(input: { userId: string; noteId: string }) {
    const note = await this.getNote(input);
    if (!note) {
      return [];
    }

    return this.revisions.get(input.noteId) ?? [];
  }

  async createRevision(input: { noteId: string; userId: string; content: string }) {
    const revision = {
      id: `rev_${Date.now()}`,
      noteId: input.noteId,
      content: input.content,
      userId: input.userId,
      createdAt: new Date().toISOString()
    };
    const revisions = this.revisions.get(input.noteId) ?? [];
    this.revisions.set(input.noteId, [revision, ...revisions]);

    for (const [userId, notes] of this.notes.entries()) {
      this.notes.set(
        userId,
        notes.map((note) =>
          note.id === input.noteId
            ? {
                ...note,
                content: input.content,
                updatedAt: revision.createdAt
              }
            : note
        )
      );
    }

    return revision;
  }
}

export class MemoryDeadlinesService implements DeadlinesService {
  private readonly deadlines = new Map<string, Array<Awaited<ReturnType<DeadlinesService["createDeadline"]>>>>();

  async listDeadlines(input: { userId: string }) {
    return this.deadlines.get(input.userId) ?? [];
  }

  async getDeadline(input: { userId: string; deadlineId: string }) {
    return (this.deadlines.get(input.userId) ?? []).find((deadline) => deadline.id === input.deadlineId) ?? null;
  }

  async createDeadline(input: {
    workspaceId: string;
    userId: string;
    title: string;
    dueAt: string;
    metadata: Record<string, unknown>;
  }) {
    const deadline = {
      id: `deadline_${Date.now()}`,
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      dueAt: input.dueAt,
      status: "OPEN" as const,
      metadata: input.metadata,
      createdAt: new Date().toISOString()
    };
    const existing = this.deadlines.get(input.userId) ?? [];
    this.deadlines.set(input.userId, [deadline, ...existing]);
    return deadline;
  }

  async updateDeadline(input: {
    userId: string;
    deadlineId: string;
    title?: string;
    dueAt?: string;
    status?: "OPEN" | "COMPLETED" | "MISSED";
    metadata?: Record<string, unknown>;
  }) {
    const deadlines = this.deadlines.get(input.userId) ?? [];
    const existing = deadlines.find((deadline) => deadline.id === input.deadlineId);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    };

    this.deadlines.set(
      input.userId,
      deadlines.map((deadline) => (deadline.id === input.deadlineId ? updated : deadline))
    );
    return updated;
  }

  async deleteDeadline(input: { userId: string; deadlineId: string }) {
    const deadlines = this.deadlines.get(input.userId) ?? [];
    const next = deadlines.filter((deadline) => deadline.id !== input.deadlineId);
    if (next.length === deadlines.length) {
      return false;
    }

    this.deadlines.set(input.userId, next);
    return true;
  }
}

export class MemoryRecommendationsService implements RecommendationsService {
  private readonly recommendations = new Map<string, Array<Awaited<ReturnType<RecommendationsService["createRecommendation"]>>>>();

  async listRecommendations(input: { userId: string }) {
    return [
      ...(this.recommendations.get(input.userId) ?? []),
      ...(this.recommendations.get("__workspace__") ?? [])
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRecommendation(input: { userId: string; recommendationId: string }) {
    return (
      [...(this.recommendations.get(input.userId) ?? []), ...(this.recommendations.get("__workspace__") ?? [])].find(
        (recommendation) => recommendation.id === input.recommendationId
      ) ?? null
    );
  }

  async createRecommendation(input: {
    workspaceId: string;
    userId?: string;
    type: string;
    title: string;
    body: string;
  }) {
    const recommendation = {
      id: `rec_${Date.now()}`,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      createdAt: new Date().toISOString(),
      deliveredAt: null
    };
    const key = input.userId ?? "__workspace__";
    const existing = this.recommendations.get(key) ?? [];
    this.recommendations.set(key, [recommendation, ...existing]);
    return recommendation;
  }

  async updateRecommendation(input: {
    userId: string;
    recommendationId: string;
    type?: string;
    title?: string;
    body?: string;
    deliveredAt?: string | null;
  }) {
    for (const key of [input.userId, "__workspace__"]) {
      const recommendations = this.recommendations.get(key) ?? [];
      const existing = recommendations.find((recommendation) => recommendation.id === input.recommendationId);
      if (!existing) {
        continue;
      }

      const updated = {
        ...existing,
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.deliveredAt !== undefined ? { deliveredAt: input.deliveredAt } : {})
      };

      this.recommendations.set(
        key,
        recommendations.map((recommendation) =>
          recommendation.id === input.recommendationId ? updated : recommendation
        )
      );
      return updated;
    }

    return null;
  }

  async deleteRecommendation(input: { userId: string; recommendationId: string }) {
    for (const key of [input.userId, "__workspace__"]) {
      const recommendations = this.recommendations.get(key) ?? [];
      const next = recommendations.filter((recommendation) => recommendation.id !== input.recommendationId);
      if (next.length !== recommendations.length) {
        this.recommendations.set(key, next);
        return true;
      }
    }

    return false;
  }
}

export class MemoryTelemetryService implements TelemetryService {
  constructor(private readonly sensorIngestionService: MemorySensorIngestionService) {}

  async getOverview(input: { hours: number; bucketMinutes: number }) {
    const now = Date.now();
    const cutoff = now - input.hours * 60 * 60 * 1000;
    const recent = this.sensorIngestionService.samples.filter((sample) => Date.parse(sample.receivedAt) >= cutoff);
    const bucketMs = input.bucketMinutes * 60 * 1000;
    const buckets = new Map<number, MemorySensorSample[]>();

    for (const sample of recent) {
      const start = Math.floor(Date.parse(sample.receivedAt) / bucketMs) * bucketMs;
      const existing = buckets.get(start) ?? [];
      existing.push(sample);
      buckets.set(start, existing);
    }

    return {
      buckets: [...buckets.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([bucketStart, samples]) => ({
          bucketStart: new Date(bucketStart).toISOString(),
          sampleCount: samples.length,
          avgNoisePct: average(samples.map((sample) => sample.noisePct)),
          avgLightPct: average(samples.map((sample) => sample.lightPct)),
          avgTemperatureC: averageNullable(samples.map((sample) => sample.temperatureC)),
          avgCo2Ppm: averageNullable(samples.map((sample) => sample.co2Ppm))
        })),
      latest: recent.slice(0, 20)
    };
  }

  async enableTimescaleSupport() {
    return {
      enabled: false,
      message: "Memory telemetry mode does not require TimescaleDB"
    };
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null);
  return average(filtered);
}
