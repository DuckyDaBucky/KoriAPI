import { config as loadDotEnv } from "dotenv";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { createDbClient, schema } from "@kori/db";

loadDotEnv();
loadDotEnv({ path: "apps/api/.env", override: false });

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const appEncryptionKey = process.env.APP_ENCRYPTION_KEY ?? "kori-development-encryption-key";
const maxJobRetries = Number(process.env.WORKER_MAX_RETRIES ?? 3);
const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 5000);

const db = createDbClient();

type WorkerJob = typeof schema.workerJobs.$inferSelect;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function decryptString(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function claimNextJob(): Promise<WorkerJob | null> {
  const queued = await db.query.workerJobs.findFirst({
    where: eq(schema.workerJobs.status, "queued"),
    orderBy: asc(schema.workerJobs.createdAt)
  });
  if (!queued) {
    return null;
  }

  const claimed = await db
    .update(schema.workerJobs)
    .set({
      status: "running",
      startedAt: new Date()
    })
    .where(and(eq(schema.workerJobs.id, queued.id), eq(schema.workerJobs.status, "queued")))
    .returning();

  return claimed[0] ?? null;
}

async function markJobComplete(job: WorkerJob, status: "succeeded" | "failed", metadata: Record<string, unknown>) {
  await db
    .update(schema.workerJobs)
    .set({
      status,
      completedAt: new Date(),
      metadata: {
        ...(job.metadata ?? {}),
        ...metadata
      }
    })
    .where(eq(schema.workerJobs.id, job.id));
}

async function recordAudit(input: {
  action: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  workspaceId?: string | null;
}): Promise<void> {
  await db.insert(schema.auditLogs).values({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: input.action,
    actorType: "system",
    actorId: "worker",
    resourceType: "worker_job",
    resourceId: input.resourceId,
    workspaceId: input.workspaceId ?? null,
    userId: null,
    metadata: input.metadata
  });
}

function getRetryCount(job: WorkerJob): number {
  return typeof job.metadata?.retryCount === "number" ? job.metadata.retryCount : 0;
}

async function updateJobMetadata(jobId: string, metadata: Record<string, unknown>): Promise<void> {
  const existing = await db.query.workerJobs.findFirst({
    where: eq(schema.workerJobs.id, jobId)
  });
  await db
    .update(schema.workerJobs)
    .set({
      metadata: {
        ...(existing?.metadata ?? {}),
        ...metadata
      }
    })
    .where(eq(schema.workerJobs.id, jobId));
}

async function handleConnectorJob(job: WorkerJob, provider: string): Promise<Record<string, unknown>> {
  const connectorRunId = typeof job.metadata?.connectorRunId === "string" ? job.metadata.connectorRunId : null;
  if (connectorRunId) {
    await db
      .update(schema.connectorRuns)
      .set({
        status: "running"
      })
      .where(eq(schema.connectorRuns.id, connectorRunId));
  }

  let result: Record<string, unknown> = {
    provider,
    mode: "staging-placeholder",
    syncedAt: new Date().toISOString()
  };

  if (provider === "crossref") {
    const response = await fetch("https://api.crossref.org/works?rows=1");
    result = {
      ...result,
      remoteStatus: response.status
    };
  }

  if (provider === "semantic-scholar") {
    const response = await fetch("https://api.semanticscholar.org/graph/v1/paper/search?query=telemetry&limit=1");
    result = {
      ...result,
      remoteStatus: response.status
    };
  }

  if (provider === "orcid") {
    result = {
      ...result,
      remoteStatus: 200,
      note: "ORCID sync placeholder executed without a live write path"
    };
  }

  if (connectorRunId) {
    const run = await db.query.connectorRuns.findFirst({
      where: eq(schema.connectorRuns.id, connectorRunId)
    });
    await db
      .update(schema.connectorRuns)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        metadata: {
          ...(run?.metadata ?? {}),
          result
        }
      })
      .where(eq(schema.connectorRuns.id, connectorRunId));
  }

  return result;
}

async function refreshSpotifyPresence(userId: string): Promise<Record<string, unknown>> {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return {
      refreshed: false,
      reason: "spotify_not_configured"
    };
  }

  const connection = await db.query.spotifyConnections.findFirst({
    where: and(eq(schema.spotifyConnections.userId, userId), eq(schema.spotifyConnections.isActive, true))
  });
  if (!connection) {
    return {
      refreshed: false,
      reason: "no_active_connection"
    };
  }

  const refreshToken = decryptString(connection.refreshTokenEnc, appEncryptionKey);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!tokenResponse.ok) {
    return {
      refreshed: false,
      reason: "spotify_refresh_failed",
      status: tokenResponse.status
    };
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token: string };
  const playbackResponse = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });

  if (playbackResponse.status === 204) {
    await db
      .update(schema.spotifyConnections)
      .set({
        lastSyncedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.spotifyConnections.userId, userId));
    return {
      refreshed: true,
      activePlayback: false
    };
  }

  if (!playbackResponse.ok) {
    return {
      refreshed: false,
      reason: "spotify_playback_failed",
      status: playbackResponse.status
    };
  }

  const playback = (await playbackResponse.json()) as {
    is_playing: boolean;
    progress_ms: number | null;
    item: null | {
      id: string | null;
      name: string;
      album: { name: string };
      artists: Array<{ name: string }>;
    };
    device?: { name?: string };
  };

  await db.insert(schema.spotifyPresenceEvents).values({
    id: `spe_${Date.now()}`,
    userId,
    isPlaying: playback.is_playing,
    trackId: playback.item?.id ?? null,
    trackName: playback.item?.name ?? null,
    albumName: playback.item?.album.name ?? null,
    artistNames: playback.item?.artists.map((artist) => artist.name) ?? [],
    progressMs: playback.progress_ms ?? null,
    deviceName: playback.device?.name ?? null
  });
  await db
    .update(schema.spotifyConnections)
    .set({
      lastSyncedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(schema.spotifyConnections.userId, userId));

  return {
    refreshed: true,
    activePlayback: playback.is_playing,
    trackId: playback.item?.id ?? null
  };
}

async function handleSpotifyRefreshJob(job: WorkerJob): Promise<Record<string, unknown>> {
  const requestedUserId = typeof job.metadata?.userId === "string" ? job.metadata.userId : null;
  if (requestedUserId) {
    return refreshSpotifyPresence(requestedUserId);
  }

  const connections = await db.query.spotifyConnections.findMany({
    where: eq(schema.spotifyConnections.isActive, true)
  });
  const results = [];
  for (const connection of connections) {
    results.push(await refreshSpotifyPresence(connection.userId));
  }
  return {
    refreshedUsers: connections.length,
    results
  };
}

async function handleTelemetryRollupJob(): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const samples = await db.query.sensorSamples.findMany({
    where: lt(schema.sensorSamples.receivedAt, new Date(Date.now() + 1000))
  });
  return {
    sampleCount: samples.length,
    since: since.toISOString(),
    status: "rollup-scan-complete"
  };
}

async function handleRecommendationFanoutJob(job: WorkerJob): Promise<Record<string, unknown>> {
  const workspaceId = job.workspaceId ?? null;
  if (!workspaceId) {
    return {
      delivered: 0
    };
  }

  const recommendations = await db.query.recommendations.findMany({
    where: and(eq(schema.recommendations.workspaceId, workspaceId), isNull(schema.recommendations.deliveredAt))
  });
  for (const recommendation of recommendations) {
    await db
      .update(schema.recommendations)
      .set({
        deliveredAt: new Date()
      })
      .where(eq(schema.recommendations.id, recommendation.id));
  }

  return {
    delivered: recommendations.length,
    workspaceId
  };
}

async function handleAuditCompactionJob(): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const staleLogs = await db.query.auditLogs.findMany({
    where: lt(schema.auditLogs.createdAt, cutoff)
  });
  return {
    olderThanCutoff: staleLogs.length,
    cutoff: cutoff.toISOString()
  };
}

async function executeJob(job: WorkerJob): Promise<Record<string, unknown>> {
  if (job.kind.startsWith("connector:")) {
    return handleConnectorJob(job, job.kind.replace("connector:", ""));
  }

  switch (job.kind) {
    case "spotify:refresh":
      return handleSpotifyRefreshJob(job);
    case "telemetry:rollup":
      return handleTelemetryRollupJob();
    case "recommendation:fanout":
      return handleRecommendationFanoutJob(job);
    case "audit:compact":
      return handleAuditCompactionJob();
    default:
      return {
        skipped: true,
        reason: "unknown_job_kind"
      };
  }
}

async function processOneJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) {
    return false;
  }

  await recordAudit({
    action: "worker.job.started",
    resourceId: job.id,
    workspaceId: job.workspaceId ?? null,
    metadata: {
      kind: job.kind
    }
  });

  const heartbeat = setInterval(() => {
    void updateJobMetadata(job.id, {
      lastHeartbeatAt: new Date().toISOString()
    });
  }, heartbeatIntervalMs);

  try {
    const metadata = await executeJob(job);
    clearInterval(heartbeat);
    await markJobComplete(job, "succeeded", metadata);
    await recordAudit({
      action: "worker.job.succeeded",
      resourceId: job.id,
      workspaceId: job.workspaceId ?? null,
      metadata
    });
  } catch (error) {
    clearInterval(heartbeat);
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const retryCount = getRetryCount(job) + 1;
    if (retryCount < maxJobRetries) {
      await db
        .update(schema.workerJobs)
        .set({
          status: "queued",
          startedAt: null,
          completedAt: null,
          metadata: {
            ...(job.metadata ?? {}),
            retryCount,
            lastError: message,
            lastRetriedAt: new Date().toISOString()
          }
        })
        .where(eq(schema.workerJobs.id, job.id));
      await recordAudit({
        action: "worker.job.requeued",
        resourceId: job.id,
        workspaceId: job.workspaceId ?? null,
        metadata: {
          retryCount,
          error: message
        }
      });
    } else {
      await markJobComplete(job, "failed", {
        ...(job.metadata ?? {}),
        retryCount,
        error: message
      });
      await recordAudit({
        action: "worker.job.failed",
        resourceId: job.id,
        workspaceId: job.workspaceId ?? null,
        metadata: {
          retryCount,
          error: message
        }
      });
    }
  }

  return true;
}

let shuttingDown = false;

async function loop(): Promise<void> {
  console.log("Kori worker bootstrap");
  console.log(`Polling every ${pollIntervalMs}ms`);

  while (!shuttingDown) {
    const processed = await processOneJob();
    if (!processed) {
      await sleep(pollIntervalMs);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

loop().catch((error) => {
  console.error("Worker loop failed", error);
  process.exitCode = 1;
});
