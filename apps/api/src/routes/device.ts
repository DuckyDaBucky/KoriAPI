import type { FastifyPluginAsync } from "fastify";
import {
  bootstrapRequestSchema,
  bootstrapResponseSchema
} from "@kori/shared";

const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/device/bootstrap", async (request, reply) => {
    const body = bootstrapRequestSchema.parse(request.body);

    try {
      const result = await app.services.bootstrapService.bootstrap({
        ...body,
        wsUrl: app.config.PUBLIC_WS_URL
      });

      return reply.code(201).send(bootstrapResponseSchema.parse(result));
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_USER_API_KEY") {
        return reply.code(401).send({
          message: "Invalid user API key"
        });
      }

      throw error;
    }
  });
};

export default deviceRoutes;
