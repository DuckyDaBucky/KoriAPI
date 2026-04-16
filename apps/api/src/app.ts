import Fastify from "fastify";
import { closeDb } from "@kori/db";
import type { AppEnv } from "./config/env.js";
import { getEnv } from "./config/env.js";
import servicesPlugin, { type AppServices } from "./plugins/services.js";
import healthRoute from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import deviceRoutes from "./routes/device.js";
import workspaceRoutes from "./routes/workspaces.js";
import wsRoutes from "./routes/ws.js";
import adminRoutes from "./routes/admin.js";
import spotifyRoutes from "./routes/spotify.js";
import dashboardRoutes from "./routes/dashboard.js";
import { createBetterAuthStub, registerBetterAuthStub } from "./services/better-auth.js";
import {
  MemoryAuthService,
  MemoryBootstrapService,
  MemoryHealthService,
  MemoryLiveStateService,
  MemoryNotificationEventService,
  MemorySensorIngestionService,
  MemorySpotifyService
} from "./services/memory.js";
import { MemoryAuditService, MemoryObservabilityService } from "./services/observability.js";
import { RedisLiveStateService } from "./services/redis.js";
import {
  DrizzleAuthService,
  DrizzleAuditService,
  DrizzleDeviceService,
  DrizzleHealthService,
  DrizzleNotificationEventService,
  DrizzleProvisioningCodeService,
  DrizzleSensorIngestionService
} from "./services/drizzle.js";
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

  return {
    authService,
    bootstrapService: bootstrap,
    deviceAuthService: bootstrap,
    deviceRegistryService: bootstrap,
    workspaceService: authService,
    provisioningCodeService: bootstrap,
    healthService: new MemoryHealthService(),
    liveStateService: new MemoryLiveStateService(),
    sensorIngestionService: new MemorySensorIngestionService(),
    notificationEventService: new MemoryNotificationEventService(),
    auditService: new MemoryAuditService(observabilityService),
    observabilityService,
    spotifyService: new MemorySpotifyService()
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
    baseServices = {
      authService,
      bootstrapService: deviceService,
      deviceAuthService: deviceService,
      deviceRegistryService: deviceService,
      workspaceService: authService,
      provisioningCodeService: provisioningService,
      healthService: new DrizzleHealthService(redis),
      liveStateService: new RedisLiveStateService(redis),
      sensorIngestionService: new DrizzleSensorIngestionService(),
      notificationEventService: new DrizzleNotificationEventService(),
      auditService: new DrizzleAuditService(observabilityService),
      observabilityService,
      spotifyService: new SpotifyHttpService(env, observabilityService)
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

  const betterAuthOptions: { secret?: string | undefined; baseUrl?: string | undefined } = {};
  if (env.BETTER_AUTH_SECRET) {
    betterAuthOptions.secret = env.BETTER_AUTH_SECRET;
  }
  if (env.BETTER_AUTH_BASE_URL) {
    betterAuthOptions.baseUrl = env.BETTER_AUTH_BASE_URL;
  }
  await registerBetterAuthStub(app, createBetterAuthStub(betterAuthOptions));
  await app.register(healthRoute);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(deviceRoutes);
  await app.register(adminRoutes);
  await app.register(spotifyRoutes);
  await app.register(dashboardRoutes);
  await app.register(wsRoutes);

  return app;
}
