import type { FastifyPluginAsync } from "fastify";
import { healthResponseSchema } from "@kori/shared";

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const [database, redis] = await Promise.all([
      app.services.healthService.databaseHealth(),
      app.services.healthService.redisHealth()
    ]);

    return healthResponseSchema.parse({
      status: database === "up" && redis === "up" ? "ok" : "degraded",
      time: new Date().toISOString(),
      services: {
        database,
        redis
      }
    });
  });
};

export default healthRoute;
