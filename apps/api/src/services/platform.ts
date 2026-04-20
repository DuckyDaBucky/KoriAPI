import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { createDbClient, schema } from "@kori/db";
import type {
  ConnectorConfig,
  ConnectorRun,
  Invitation,
  JobStatus,
  MfaFactor,
  QuotaUsage,
  ServiceToken,
  TemporalEvent,
  TemporalSignal,
  WorkspaceRole
} from "@kori/shared";
import { randomUUID } from "node:crypto";
import {
  buildTotpOtpAuthUrl,
  decryptString,
  encryptString,
  generateBase32Secret,
  generateOpaqueToken,
  redactSensitive,
  sha256,
  verifyTotpCode
} from "../utils/crypto.js";
import type {
  ConnectorsService,
  JobsService,
  QuotasService,
  SecurityService,
  TemporalService
} from "./types.js";

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function toMfaFactor(row: {
  id: string;
  type: string;
  label: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}): MfaFactor {
  return {
    id: row.id,
    type: "totp",
    label: row.label,
    verified: row.verifiedAt !== null,
    createdAt: row.createdAt.toISOString()
  };
}

type MemoryInvitationRecord = Invitation & {
  token: string;
};

type MemoryServiceTokenRecord = ServiceToken & {
  tokenHash: string;
};

type MemoryConnectorConfigRecord = ConnectorConfig & {
  config: Record<string, unknown>;
};

export class MemoryJobsService implements JobsService {
  private readonly jobs: JobStatus[] = [];

  async listJobs(limit = 100): Promise<JobStatus[]> {
    return this.jobs.slice(0, limit);
  }

  async enqueue(input: {
    kind: string;
    workspaceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<JobStatus> {
    const job: JobStatus = {
      id: createId("job"),
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      metadata: redactSensitive(input.metadata)
    };
    this.jobs.unshift(job);
    this.jobs.splice(200);
    return job;
  }
}

export class MemorySecurityService implements SecurityService {
  private readonly mfaFactors = new Map<string, Array<{ factor: MfaFactor; secret: string; backupCodes: string[] }>>();
  private readonly invitations: MemoryInvitationRecord[] = [];
  private readonly serviceTokens: MemoryServiceTokenRecord[] = [];
  private readonly memberships = new Map<string, Array<{ id: string; role: WorkspaceRole; name: string; slug: string }>>();

  constructor() {
    this.memberships.set("user_dev", [
      {
        id: "ws_dev",
        role: "platform_admin",
        name: "Kori Default Workspace",
        slug: "kori-default-workspace"
      }
    ]);
  }

  async listMfaFactors(userId: string): Promise<MfaFactor[]> {
    return (this.mfaFactors.get(userId) ?? []).map((entry) => entry.factor);
  }

  async enrollTotp(input: {
    userId: string;
    email: string;
    label?: string;
  }): Promise<{ factor: MfaFactor; secret: string; otpauthUrl: string; backupCodes: string[] }> {
    const secret = generateBase32Secret();
    const backupCodes = Array.from({ length: 8 }, () => generateOpaqueToken(6));
    const factor: MfaFactor = {
      id: createId("mfa"),
      type: "totp",
      label: input.label ?? null,
      verified: false,
      createdAt: new Date().toISOString()
    };
    const existing = this.mfaFactors.get(input.userId) ?? [];
    this.mfaFactors.set(input.userId, [{ factor, secret, backupCodes }, ...existing]);
    return {
      factor,
      secret,
      otpauthUrl: buildTotpOtpAuthUrl({
        secret,
        accountName: input.email,
        issuer: "KoriAPI"
      }),
      backupCodes
    };
  }

  async verifyMfaFactor(input: { userId: string; factorId: string; code: string }): Promise<boolean> {
    const factors = this.mfaFactors.get(input.userId) ?? [];
    const match = factors.find((entry) => entry.factor.id === input.factorId);
    if (!match) {
      return false;
    }
    const verified =
      verifyTotpCode(match.secret, input.code) ||
      match.backupCodes.some((backupCode) => backupCode === input.code.trim());
    if (!verified) {
      return false;
    }

    match.factor = {
      ...match.factor,
      verified: true
    };
    match.backupCodes = match.backupCodes.filter((backupCode) => backupCode !== input.code.trim());
    return true;
  }

  async disableMfaFactor(input: { userId: string; factorId: string }): Promise<boolean> {
    const factors = this.mfaFactors.get(input.userId) ?? [];
    const next = factors.filter((entry) => entry.factor.id !== input.factorId);
    if (next.length === factors.length) {
      return false;
    }
    this.mfaFactors.set(input.userId, next);
    return true;
  }

  async listInvitations(input: { workspaceIds?: string[] }): Promise<Invitation[]> {
    return this.invitations
      .filter((invitation) => !input.workspaceIds || input.workspaceIds.includes(invitation.workspaceId))
      .map(({ token: _token, ...invitation }) => invitation);
  }

  async createInvitation(input: {
    email: string;
    workspaceId: string;
    role: Extract<WorkspaceRole, "workspace_admin" | "member" | "service">;
    expiresInSec: number;
    invitedByUserId?: string | null;
  }): Promise<{ invitation: Invitation; token: string }> {
    const token = `kori_inv_${generateOpaqueToken(12)}`;
    const invitation: MemoryInvitationRecord = {
      id: createId("inv"),
      email: input.email,
      workspaceId: input.workspaceId,
      role: input.role,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + input.expiresInSec * 1000).toISOString(),
      acceptedAt: null,
      token
    };
    this.invitations.unshift(invitation);
    const { token: _token, ...publicInvitation } = invitation;
    return {
      invitation: publicInvitation,
      token
    };
  }

  async acceptInvitation(input: { userId: string; userEmail: string; token: string }): Promise<Invitation | null> {
    const invitation = this.invitations.find((entry) => entry.token === input.token);
    if (!invitation) {
      return null;
    }
    if (invitation.email !== input.userEmail || Date.parse(invitation.expiresAt) <= Date.now()) {
      return null;
    }

    invitation.status = "accepted";
    invitation.acceptedAt = new Date().toISOString();
    const memberships = this.memberships.get(input.userId) ?? [];
    if (!memberships.some((membership) => membership.id === invitation.workspaceId)) {
      memberships.push({
        id: invitation.workspaceId,
        role: invitation.role,
        name: invitation.workspaceId,
        slug: invitation.workspaceId
      });
      this.memberships.set(input.userId, memberships);
    }
    const { token: _token, ...publicInvitation } = invitation;
    return publicInvitation;
  }

  async listServiceTokens(input: { workspaceIds?: string[] }): Promise<ServiceToken[]> {
    return this.serviceTokens.filter(
      (token) => !input.workspaceIds || !token.workspaceId || input.workspaceIds.includes(token.workspaceId)
    );
  }

  async createServiceToken(input: {
    workspaceId?: string;
    label: string;
  }): Promise<{ serviceToken: ServiceToken; rawToken: string }> {
    const rawToken = `kori_srv_${generateOpaqueToken(18)}`;
    const serviceToken: MemoryServiceTokenRecord = {
      id: createId("st"),
      label: input.label,
      workspaceId: input.workspaceId ?? null,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      tokenHash: sha256(rawToken)
    };
    this.serviceTokens.unshift(serviceToken);
    return {
      serviceToken,
      rawToken
    };
  }

  async revokeServiceToken(id: string): Promise<boolean> {
    const token = this.serviceTokens.find((entry) => entry.id === id);
    if (!token) {
      return false;
    }
    token.isActive = false;
    return true;
  }
}

export class MemoryConnectorsService implements ConnectorsService {
  private readonly configs: MemoryConnectorConfigRecord[] = [];
  private readonly runs: ConnectorRun[] = [];

  constructor(private readonly jobsService: JobsService) {}

  async listConfigs(input: { workspaceIds?: string[] }): Promise<ConnectorConfig[]> {
    return this.configs.filter((config) => !input.workspaceIds || input.workspaceIds.includes(config.workspaceId));
  }

  async upsertConfig(input: {
    workspaceId: string;
    provider: string;
    config: Record<string, unknown>;
  }): Promise<ConnectorConfig> {
    const now = new Date().toISOString();
    const existing = this.configs.find(
      (config) => config.workspaceId === input.workspaceId && config.provider === input.provider
    );
    if (existing) {
      existing.config = input.config;
      existing.updatedAt = now;
      return existing;
    }

    const config: MemoryConnectorConfigRecord = {
      id: createId("cfg"),
      provider: input.provider,
      workspaceId: input.workspaceId,
      createdAt: now,
      updatedAt: now,
      config: input.config
    };
    this.configs.unshift(config);
    return config;
  }

  async listRuns(input: { workspaceIds?: string[]; limit?: number }): Promise<ConnectorRun[]> {
    return this.runs
      .filter((run) => !input.workspaceIds || input.workspaceIds.includes(run.workspaceId))
      .slice(0, input.limit ?? 100);
  }

  async triggerRun(input: { workspaceId: string; provider: string; triggeredBy?: string | null }): Promise<ConnectorRun> {
    const run: ConnectorRun = {
      id: createId("run"),
      provider: input.provider,
      workspaceId: input.workspaceId,
      status: "queued",
      startedAt: new Date().toISOString(),
      completedAt: null,
      metadata: redactSensitive({
        triggeredBy: input.triggeredBy ?? null
      })
    };
    this.runs.unshift(run);
    await this.jobsService.enqueue({
      kind: `connector:${input.provider}`,
      workspaceId: input.workspaceId,
      metadata: {
        connectorRunId: run.id,
        provider: input.provider
      }
    });
    return run;
  }
}

export class MemoryQuotasService implements QuotasService {
  async listUsage(): Promise<QuotaUsage[]> {
    return [
      {
        workspaceId: "ws_dev",
        storageMbLimit: 1024,
        storageMbUsed: 12,
        deviceLimit: 10,
        deviceCount: 0,
        monthlyAiTokensLimit: 0,
        monthlyAiTokensUsed: 0
      }
    ];
  }
}

export class MemoryTemporalService implements TemporalService {
  private readonly events: TemporalEvent[] = [];
  private readonly signals: TemporalSignal[] = [];

  async listEvents(limit = 100): Promise<TemporalEvent[]> {
    return this.events.slice(0, limit);
  }

  async listSignals(limit = 100): Promise<TemporalSignal[]> {
    return this.signals.slice(0, limit);
  }

  async recordEvent(input: {
    type: string;
    workspaceId?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<TemporalEvent> {
    const event: TemporalEvent = {
      id: createId("te"),
      type: input.type,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      createdAt: new Date().toISOString(),
      metadata: redactSensitive(input.metadata)
    };
    const signal: TemporalSignal = {
      id: createId("ts"),
      type: `${input.type}_signal`,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      createdAt: event.createdAt,
      payload: {
        sourceEventId: event.id
      }
    };
    this.events.unshift(event);
    this.signals.unshift(signal);
    return event;
  }
}

export class DrizzleJobsService implements JobsService {
  async listJobs(limit = 100): Promise<JobStatus[]> {
    const db = createDbClient();
    const rows = await db.query.workerJobs.findMany({
      orderBy: desc(schema.workerJobs.createdAt),
      limit
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      kind: row.kind,
      workspaceId: row.workspaceId ?? null,
      status: row.status as JobStatus["status"],
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      metadata: row.metadata
    }));
  }

  async enqueue(input: {
    kind: string;
    workspaceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<JobStatus> {
    const db = createDbClient();
    const id = createId("job");
    const createdAt = new Date();
    await db.insert(schema.workerJobs).values({
      id,
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      metadata: redactSensitive(input.metadata),
      status: "queued",
      createdAt
    });
    return {
      id,
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      status: "queued",
      createdAt: createdAt.toISOString(),
      startedAt: null,
      completedAt: null,
      metadata: redactSensitive(input.metadata)
    };
  }
}

export class DrizzleSecurityService implements SecurityService {
  constructor(private readonly encryptionKey: string) {}

  async listMfaFactors(userId: string): Promise<MfaFactor[]> {
    const db = createDbClient();
    const rows = await db.query.mfaFactors.findMany({
      where: eq(schema.mfaFactors.userId, userId),
      orderBy: desc(schema.mfaFactors.createdAt)
    });
    return rows.map((row: (typeof rows)[number]) => toMfaFactor(row));
  }

  async enrollTotp(input: {
    userId: string;
    email: string;
    label?: string;
  }): Promise<{ factor: MfaFactor; secret: string; otpauthUrl: string; backupCodes: string[] }> {
    const db = createDbClient();
    const secret = generateBase32Secret();
    const backupCodes = Array.from({ length: 8 }, () => generateOpaqueToken(6));
    const id = createId("mfa");
    const createdAt = new Date();
    await db.insert(schema.mfaFactors).values({
      id,
      userId: input.userId,
      type: "totp",
      label: input.label ?? null,
      secretEnc: encryptString(secret, this.encryptionKey),
      backupCodesEnc: encryptString(JSON.stringify(backupCodes), this.encryptionKey),
      createdAt
    });
    const factor: MfaFactor = {
      id,
      type: "totp",
      label: input.label ?? null,
      verified: false,
      createdAt: createdAt.toISOString()
    };
    return {
      factor,
      secret,
      otpauthUrl: buildTotpOtpAuthUrl({
        secret,
        accountName: input.email,
        issuer: "KoriAPI"
      }),
      backupCodes
    };
  }

  async verifyMfaFactor(input: { userId: string; factorId: string; code: string }): Promise<boolean> {
    const db = createDbClient();
    const factor = await db.query.mfaFactors.findFirst({
      where: and(eq(schema.mfaFactors.id, input.factorId), eq(schema.mfaFactors.userId, input.userId))
    });
    if (!factor) {
      return false;
    }

    const secret = decryptString(factor.secretEnc, this.encryptionKey);
    const backupCodes = factor.backupCodesEnc
      ? (JSON.parse(decryptString(factor.backupCodesEnc, this.encryptionKey)) as string[])
      : [];
    const normalizedCode = input.code.trim();
    const matchedBackupCode = backupCodes.find((entry) => entry === normalizedCode);
    const verified = verifyTotpCode(secret, normalizedCode) || Boolean(matchedBackupCode);
    if (!verified) {
      return false;
    }

    await db
      .update(schema.mfaFactors)
      .set({
        verifiedAt: new Date(),
        ...(matchedBackupCode
          ? {
              backupCodesEnc: encryptString(
                JSON.stringify(backupCodes.filter((entry) => entry !== matchedBackupCode)),
                this.encryptionKey
              )
            }
          : {})
      })
      .where(eq(schema.mfaFactors.id, factor.id));
    return true;
  }

  async disableMfaFactor(input: { userId: string; factorId: string }): Promise<boolean> {
    const db = createDbClient();
    const factor = await db.query.mfaFactors.findFirst({
      where: and(eq(schema.mfaFactors.id, input.factorId), eq(schema.mfaFactors.userId, input.userId))
    });
    if (!factor) {
      return false;
    }
    await db.delete(schema.mfaFactors).where(eq(schema.mfaFactors.id, factor.id));
    return true;
  }

  async listInvitations(input: { workspaceIds?: string[] }): Promise<Invitation[]> {
    const db = createDbClient();
    const rows = await db.query.invitations.findMany({
      where: input.workspaceIds ? inArray(schema.invitations.workspaceId, input.workspaceIds) : undefined,
      orderBy: desc(schema.invitations.createdAt)
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      email: row.email,
      workspaceId: row.workspaceId,
      role: row.role,
      status:
        row.status === "accepted"
          ? "accepted"
          : row.status === "revoked"
            ? "revoked"
            : row.status === "pending" && row.expiresAt.getTime() <= Date.now()
              ? "expired"
              : "pending",
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null
    }));
  }

  async createInvitation(input: {
    email: string;
    workspaceId: string;
    role: Extract<WorkspaceRole, "workspace_admin" | "member" | "service">;
    expiresInSec: number;
    invitedByUserId?: string | null;
  }): Promise<{ invitation: Invitation; token: string }> {
    const db = createDbClient();
    const id = createId("inv");
    const token = `kori_inv_${generateOpaqueToken(12)}`;
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + input.expiresInSec * 1000);
    await db.insert(schema.invitations).values({
      id,
      email: input.email,
      tokenHash: sha256(token),
      role: input.role,
      status: "pending",
      workspaceId: input.workspaceId,
      invitedByUserId: input.invitedByUserId ?? null,
      createdAt,
      expiresAt
    });
    return {
      invitation: {
        id,
        email: input.email,
        workspaceId: input.workspaceId,
        role: input.role,
        status: "pending",
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        acceptedAt: null
      },
      token
    };
  }

  async acceptInvitation(input: { userId: string; userEmail: string; token: string }): Promise<Invitation | null> {
    const db = createDbClient();
    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(schema.invitations.tokenHash, sha256(input.token)),
        eq(schema.invitations.email, input.userEmail),
        eq(schema.invitations.status, "pending"),
        gt(schema.invitations.expiresAt, new Date())
      )
    });
    if (!invitation) {
      return null;
    }

    const existingMembership = await db.query.workspaceMemberships.findFirst({
      where: and(
        eq(schema.workspaceMemberships.workspaceId, invitation.workspaceId),
        eq(schema.workspaceMemberships.userId, input.userId)
      )
    });
    if (!existingMembership) {
      await db.insert(schema.workspaceMemberships).values({
        id: createId("wm"),
        workspaceId: invitation.workspaceId,
        userId: input.userId,
        role: invitation.role
      });
    }

    await db
      .update(schema.invitations)
      .set({
        status: "accepted",
        acceptedAt: new Date()
      })
      .where(eq(schema.invitations.id, invitation.id));

    return {
      id: invitation.id,
      email: invitation.email,
      workspaceId: invitation.workspaceId,
      role: invitation.role,
      status: "accepted",
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: new Date().toISOString()
    };
  }

  async listServiceTokens(input: { workspaceIds?: string[] }): Promise<ServiceToken[]> {
    const db = createDbClient();
    const rows = await db.query.serviceTokens.findMany({
      where: input.workspaceIds ? inArray(schema.serviceTokens.workspaceId, input.workspaceIds) : undefined,
      orderBy: desc(schema.serviceTokens.createdAt)
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      label: row.label,
      workspaceId: row.workspaceId ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null
    }));
  }

  async createServiceToken(input: {
    workspaceId?: string;
    label: string;
  }): Promise<{ serviceToken: ServiceToken; rawToken: string }> {
    const db = createDbClient();
    const id = createId("st");
    const createdAt = new Date();
    const rawToken = `kori_srv_${generateOpaqueToken(18)}`;
    await db.insert(schema.serviceTokens).values({
      id,
      workspaceId: input.workspaceId ?? null,
      label: input.label,
      tokenHash: sha256(rawToken),
      createdAt,
      isActive: true
    });
    return {
      serviceToken: {
        id,
        label: input.label,
        workspaceId: input.workspaceId ?? null,
        isActive: true,
        createdAt: createdAt.toISOString(),
        lastUsedAt: null
      },
      rawToken
    };
  }

  async revokeServiceToken(id: string): Promise<boolean> {
    const db = createDbClient();
    const token = await db.query.serviceTokens.findFirst({
      where: eq(schema.serviceTokens.id, id)
    });
    if (!token) {
      return false;
    }
    await db
      .update(schema.serviceTokens)
      .set({
        isActive: false
      })
      .where(eq(schema.serviceTokens.id, id));
    return true;
  }
}

export class DrizzleConnectorsService implements ConnectorsService {
  constructor(
    private readonly encryptionKey: string,
    private readonly jobsService: JobsService
  ) {}

  async listConfigs(input: { workspaceIds?: string[] }): Promise<ConnectorConfig[]> {
    const db = createDbClient();
    const rows = await db.query.connectorConfigs.findMany({
      where: input.workspaceIds ? inArray(schema.connectorConfigs.workspaceId, input.workspaceIds) : undefined,
      orderBy: desc(schema.connectorConfigs.updatedAt)
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      provider: row.provider,
      workspaceId: row.workspaceId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async upsertConfig(input: {
    workspaceId: string;
    provider: string;
    config: Record<string, unknown>;
  }): Promise<ConnectorConfig> {
    const db = createDbClient();
    const existing = await db.query.connectorConfigs.findFirst({
      where: and(
        eq(schema.connectorConfigs.workspaceId, input.workspaceId),
        eq(schema.connectorConfigs.provider, input.provider)
      )
    });
    const now = new Date();
    const configEnc = encryptString(JSON.stringify(input.config), this.encryptionKey);
    if (existing) {
      await db
        .update(schema.connectorConfigs)
        .set({
          configEnc,
          updatedAt: now
        })
        .where(eq(schema.connectorConfigs.id, existing.id));
      return {
        id: existing.id,
        provider: existing.provider,
        workspaceId: existing.workspaceId,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: now.toISOString()
      };
    }

    const id = createId("cfg");
    await db.insert(schema.connectorConfigs).values({
      id,
      provider: input.provider,
      workspaceId: input.workspaceId,
      configEnc,
      createdAt: now,
      updatedAt: now
    });
    return {
      id,
      provider: input.provider,
      workspaceId: input.workspaceId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
  }

  async listRuns(input: { workspaceIds?: string[]; limit?: number }): Promise<ConnectorRun[]> {
    const db = createDbClient();
    const rows = await db.query.connectorRuns.findMany({
      where: input.workspaceIds ? inArray(schema.connectorRuns.workspaceId, input.workspaceIds) : undefined,
      orderBy: desc(schema.connectorRuns.startedAt),
      limit: input.limit ?? 100
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      provider: row.provider,
      workspaceId: row.workspaceId,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      metadata: redactSensitive(row.metadata)
    }));
  }

  async triggerRun(input: { workspaceId: string; provider: string; triggeredBy?: string | null }): Promise<ConnectorRun> {
    const db = createDbClient();
    const id = createId("run");
    const startedAt = new Date();
    const metadata = redactSensitive({
      triggeredBy: input.triggeredBy ?? null
    });
    await db.insert(schema.connectorRuns).values({
      id,
      provider: input.provider,
      workspaceId: input.workspaceId,
      status: "queued",
      startedAt,
      metadata
    });
    await this.jobsService.enqueue({
      kind: `connector:${input.provider}`,
      workspaceId: input.workspaceId,
      metadata: {
        connectorRunId: id,
        provider: input.provider
      }
    });
    return {
      id,
      provider: input.provider,
      workspaceId: input.workspaceId,
      status: "queued",
      startedAt: startedAt.toISOString(),
      completedAt: null,
      metadata
    };
  }
}

export class DrizzleQuotasService implements QuotasService {
  async listUsage(input?: { workspaceIds?: string[] }): Promise<QuotaUsage[]> {
    const db = createDbClient();
    const quotas = await db.query.quotas.findMany({
      where: input?.workspaceIds ? inArray(schema.quotas.workspaceId, input.workspaceIds) : undefined,
      orderBy: desc(schema.quotas.updatedAt)
    });

    const usages = await Promise.all(
      quotas.map(async (quota: (typeof quotas)[number]) => {
        const [deviceCountRow, storageRow] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)` })
            .from(schema.devices)
            .where(eq(schema.devices.workspaceId, quota.workspaceId)),
          db
            .select({ bytes: sql<number>`coalesce(sum(${schema.documentAssets.sizeBytes}), 0)` })
            .from(schema.documentAssets)
            .innerJoin(schema.notes, eq(schema.documentAssets.noteId, schema.notes.id))
            .where(eq(schema.notes.workspaceId, quota.workspaceId))
        ]);

        return {
          workspaceId: quota.workspaceId,
          storageMbLimit: quota.storageMb,
          storageMbUsed: Math.round(((storageRow[0]?.bytes ?? 0) / (1024 * 1024)) * 100) / 100,
          deviceLimit: quota.deviceLimit,
          deviceCount: Number(deviceCountRow[0]?.count ?? 0),
          monthlyAiTokensLimit: quota.monthlyAiTokens,
          monthlyAiTokensUsed: 0
        } satisfies QuotaUsage;
      })
    );

    return usages;
  }
}

export class DrizzleTemporalService implements TemporalService {
  async listEvents(limit = 100): Promise<TemporalEvent[]> {
    const db = createDbClient();
    const rows = await db.query.temporalEvents.findMany({
      orderBy: desc(schema.temporalEvents.createdAt),
      limit
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      type: row.type,
      workspaceId: row.workspaceId ?? null,
      userId: row.userId ?? null,
      deviceId: row.deviceId ?? null,
      createdAt: row.createdAt.toISOString(),
      metadata: redactSensitive(row.metadata)
    }));
  }

  async listSignals(limit = 100): Promise<TemporalSignal[]> {
    const db = createDbClient();
    const rows = await db.query.temporalSignals.findMany({
      orderBy: desc(schema.temporalSignals.createdAt),
      limit
    });
    return rows.map((row: (typeof rows)[number]) => ({
      id: row.id,
      type: row.type,
      workspaceId: row.workspaceId ?? null,
      userId: row.userId ?? null,
      createdAt: row.createdAt.toISOString(),
      payload: redactSensitive(row.payload)
    }));
  }

  async recordEvent(input: {
    type: string;
    workspaceId?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<TemporalEvent> {
    const db = createDbClient();
    const eventId = createId("te");
    const signalId = createId("ts");
    const createdAt = new Date();
    const safeMetadata = redactSensitive(input.metadata);
    await db.insert(schema.temporalEvents).values({
      id: eventId,
      type: input.type,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      metadata: safeMetadata,
      createdAt
    });
    await db.insert(schema.temporalSignals).values({
      id: signalId,
      type: `${input.type}_signal`,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      payload: {
        sourceEventId: eventId
      },
      createdAt
    });
    return {
      id: eventId,
      type: input.type,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      createdAt: createdAt.toISOString(),
      metadata: safeMetadata
    };
  }
}
