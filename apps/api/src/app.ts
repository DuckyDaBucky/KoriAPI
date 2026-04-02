import Fastify from "fastify";
import { prisma } from "@kori/db";
import type { AppEnv } from "./config/env.js";
import { getEnv } from "./config/env.js";
import servicesPlugin, { type AppServices } from "./plugins/services.js";
import healthRoute from "./routes/health.js";
import deviceRoutes from "./routes/device.js";
import wsRoutes from "./routes/ws.js";
import { createBetterAuthStub, registerBetterAuthStub } from "./services/better-auth.js";
import {
  MemoryBootstrapService,
  MemoryHealthService,
  MemoryLiveStateService,
  MemoryNotificationEventService,
  MemorySensorIngestionService
} from "./services/memory.js";
import { RedisLiveStateService } from "./services/redis.js";
import {
  PrismaDeviceService,
  PrismaHealthService,
  PrismaNotificationEventService,
  PrismaSensorIngestionService
} from "./services/prisma.js";
import type { RedisClient } from "./services/types.js";

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

export function createDefaultServices(): AppServices {
  const bootstrap = new MemoryBootstrapService();

  return {
    bootstrapService: bootstrap,
    deviceAuthService: bootstrap,
    healthService: new MemoryHealthService(),
    liveStateService: new MemoryLiveStateService(),
    sensorIngestionService: new MemorySensorIngestionService(),
    notificationEventService: new MemoryNotificationEventService()
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
    await prisma.$connect();
  }

  let baseServices: AppServices;
  if (env.NODE_ENV === "test") {
    baseServices = createDefaultServices();
  } else {
    const redis = redisForClose as RedisClient;
    const deviceService = new PrismaDeviceService();
    baseServices = {
      bootstrapService: deviceService,
      deviceAuthService: deviceService,
      healthService: new PrismaHealthService(redis),
      liveStateService: new RedisLiveStateService(redis),
      sensorIngestionService: new PrismaSensorIngestionService(),
      notificationEventService: new PrismaNotificationEventService()
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
      await prisma.$disconnect();
    }
  });

  await app.register(servicesPlugin, { services });
  const betterAuthOptions: { secret?: string | undefined; baseUrl?: string | undefined } = {};
  if (env.BETTER_AUTH_SECRET) {
    betterAuthOptions.secret = env.BETTER_AUTH_SECRET;
  }
  if (env.BETTER_AUTH_BASE_URL) {
    betterAuthOptions.baseUrl = env.BETTER_AUTH_BASE_URL;
  }
  await registerBetterAuthStub(
    app,
    createBetterAuthStub(betterAuthOptions)
  );
  await app.register(healthRoute);
  await app.register(deviceRoutes);
  await app.register(wsRoutes);

  return app;
}
