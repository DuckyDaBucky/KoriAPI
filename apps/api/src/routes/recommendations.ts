import type { FastifyPluginAsync } from "fastify";
import { recommendationCreateRequestSchema, recommendationSchema } from "@kori/shared";
import { requireUserSession } from "../utils/admin-auth.js";

const recommendationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/recommendations", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const recommendations = await app.services.recommendationsService.listRecommendations({
      userId: session.user.id
    });
    return recommendations.map((recommendation) => recommendationSchema.parse(recommendation));
  });

  app.post("/v1/recommendations", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = recommendationCreateRequestSchema.parse(request.body);
    const workspaceAllowed = session.user.workspaces.some((workspace) => workspace.id === body.workspaceId);
    if (!workspaceAllowed) {
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN_WORKSPACE",
          message: "You do not have access to that workspace"
        }
      });
    }

    const recommendation = await app.services.recommendationsService.createRecommendation({
      workspaceId: body.workspaceId,
      ...(body.userId !== undefined ? { userId: body.userId } : { userId: session.user.id }),
      type: body.type,
      title: body.title,
      body: body.body
    });

    return reply.code(201).send(recommendationSchema.parse(recommendation));
  });
};

export default recommendationsRoutes;
