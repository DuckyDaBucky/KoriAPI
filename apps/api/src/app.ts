import Fastify from "fastify";
import { closeDb } from "@kori/db";
import type { AppEnv } from "./config/env.js";
import { getEnv } from "./config/env.js";
import servicesPlugin, { type AppServices } from "./plugins/services.js";
import healthRoute from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import connectorsRoutes from "./routes/connectors.js";
import notesRoutes from "./routes/notes.js";
import deadlinesRoutes from "./routes/deadlines.js";
import recommendationsRoutes from "./routes/recommendations.js";
import deviceRoutes from "./routes/device.js";
import serviceTokenRoutes from "./routes/service-tokens.js";
import workspaceRoutes from "./routes/workspaces.js";
import wsRoutes from "./routes/ws.js";
import adminRoutes from "./routes/admin.js";
import spotifyRoutes from "./routes/spotify.js";
import {
  MemoryAuthService,
  MemoryBootstrapService,
  MemoryDeadlinesService,
  MemoryHealthService,
  MemoryLiveStateService,
  MemoryNotesService,
  MemoryNotificationEventService,
  MemoryRecommendationsService,
  MemorySensorIngestionService,
  MemorySpotifyService,
  MemoryTelemetryService
} from "./services/memory.js";
import { MemoryAuditService, MemoryObservabilityService } from "./services/observability.js";
import { RedisLiveStateService } from "./services/redis.js";
import {
  DrizzleAuthService,
  DrizzleAuditService,
  DrizzleDeadlinesService,
  DrizzleDeviceService,
  DrizzleHealthService,
  DrizzleNotesService,
  DrizzleNotificationEventService,
  DrizzleProvisioningCodeService,
  DrizzleRecommendationsService,
  DrizzleTelemetryService,
  DrizzleSensorIngestionService
} from "./services/drizzle.js";
import {
  DrizzleConnectorsService,
  DrizzleJobsService,
  DrizzleQuotasService,
  DrizzleSecurityService,
  DrizzleTemporalService,
  MemoryConnectorsService,
  MemoryJobsService,
  MemoryQuotasService,
  MemorySecurityService,
  MemoryTemporalService
} from "./services/platform.js";
import type { RedisClient } from "./services/types.js";
import { SpotifyHttpService } from "./services/spotify.js";

const RedisConstructor = (await import("ioredis")).default as unknown as new (
  url: string,
  options: { lazyConnect: boolean; maxRetriesPerRequest: number }
) => RedisClient;

declare module "fastify" {
  interface FastifyInstance {
    config: AppEnv;
  }
}

export interface BuildServerOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  services?: Partial<AppServices>;
}

export function createDefaultServices(env: AppEnv): AppServices {
  const bootstrap = new MemoryBootstrapService();
  const observabilityService = new MemoryObservabilityService();
  const authService = new MemoryAuthService();
  const sensorIngestionService = new MemorySensorIngestionService();
  const jobsService = new MemoryJobsService();

  return {
    authService,
    bootstrapService: bootstrap,
    connectorsService: new MemoryConnectorsService(jobsService),
    deadlinesService: new MemoryDeadlinesService(),
    deviceAuthService: bootstrap,
    deviceRegistryService: bootstrap,
    workspaceService: authService,
    provisioningCodeService: bootstrap,
    healthService: new MemoryHealthService(),
    jobsService,
    liveStateService: new MemoryLiveStateService(),
    notesService: new MemoryNotesService(),
    sensorIngestionService,
    notificationEventService: new MemoryNotificationEventService(),
    auditService: new MemoryAuditService(observabilityService),
    observabilityService,
    quotasService: new MemoryQuotasService(),
    recommendationsService: new MemoryRecommendationsService(),
    securityService: new MemorySecurityService(),
    spotifyService: new MemorySpotifyService(),
    telemetryService: new MemoryTelemetryService(sensorIngestionService),
    temporalService: new MemoryTemporalService()
  };
}

export async function buildServer(options: BuildServerOptions = {}) {
  const env = getEnv(options.env);
  const app = Fastify({
    logger: true
  });
  let redisForClose: RedisClient | null = null;

  app.decorate("config", env);

  if (env.NODE_ENV !== "test") {
    redisForClose = new RedisConstructor(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    await redisForClose.connect();
  }

  let baseServices: AppServices;
  if (env.NODE_ENV === "test") {
    baseServices = createDefaultServices(env);
  } else {
    const redis = redisForClose as RedisClient;
    const provisioningService = new DrizzleProvisioningCodeService();
    const observabilityService = new MemoryObservabilityService();
    const deviceService = new DrizzleDeviceService(provisioningService);
    const authService = new DrizzleAuthService();
    const jobsService = new DrizzleJobsService();
    baseServices = {
      authService,
      bootstrapService: deviceService,
      connectorsService: new DrizzleConnectorsService(env.APP_ENCRYPTION_KEY, jobsService),
      deadlinesService: new DrizzleDeadlinesService(),
      deviceAuthService: deviceService,
      deviceRegistryService: deviceService,
      workspaceService: authService,
      provisioningCodeService: provisioningService,
      healthService: new DrizzleHealthService(redis),
      jobsService,
      liveStateService: new RedisLiveStateService(redis),
      notesService: new DrizzleNotesService(),
      sensorIngestionService: new DrizzleSensorIngestionService(),
      notificationEventService: new DrizzleNotificationEventService(),
      auditService: new DrizzleAuditService(observabilityService),
      observabilityService,
      quotasService: new DrizzleQuotasService(),
      recommendationsService: new DrizzleRecommendationsService(),
      securityService: new DrizzleSecurityService(env.APP_ENCRYPTION_KEY),
      spotifyService: new SpotifyHttpService(env, observabilityService),
      telemetryService: new DrizzleTelemetryService(),
      temporalService: new DrizzleTemporalService()
    };
  }

  const services = {
    ...baseServices,
    ...options.services
  } satisfies AppServices;

  app.addHook("onClose", async () => {
    if (env.NODE_ENV !== "test") {
      if (redisForClose) {
        await redisForClose.quit();
      }
      await closeDb();
    }
  });

  await app.register(servicesPlugin, { services });

  app.addHook("onResponse", async (request, reply) => {
    await app.services.observabilityService.log({
      level: reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info",
      message: `${request.method} ${request.routeOptions.url}`,
      route: request.routeOptions.url ?? request.url.split("?")[0] ?? null,
      method: request.method,
      requestId: request.id,
      statusCode: reply.statusCode,
      workspaceId: null,
      userId: null,
      deviceId: null,
      integration: null,
      metadata: {
        remoteAddress: request.ip
      }
    });
  });

  await app.register(healthRoute);
  await app.register(authRoutes);
  await app.register(serviceTokenRoutes);
  await app.register(workspaceRoutes);
  await app.register(notesRoutes);
  await app.register(deadlinesRoutes);
  await app.register(recommendationsRoutes);
  await app.register(connectorsRoutes);
  await app.register(deviceRoutes);
  await app.register(adminRoutes);
  await app.register(spotifyRoutes);
  await app.register(wsRoutes);

  return app;
}
