import type { FastifyPluginAsync } from "fastify";
import {
  recommendationCreateRequestSchema,
  recommendationSchema,
  recommendationUpdateRequestSchema
} from "@kori/shared";
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

  app.get("/v1/recommendations/:recommendationId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const recommendationId = (request.params as { recommendationId: string }).recommendationId;
    const recommendation = await app.services.recommendationsService.getRecommendation({
      userId: session.user.id,
      recommendationId
    });
    if (!recommendation) {
      return reply.code(404).send({
        error: {
          code: "RECOMMENDATION_NOT_FOUND",
          message: "Recommendation was not found"
        }
      });
    }

    return recommendationSchema.parse(recommendation);
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

  app.patch("/v1/recommendations/:recommendationId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const recommendationId = (request.params as { recommendationId: string }).recommendationId;
    const body = recommendationUpdateRequestSchema.parse(request.body);
    const recommendation = await app.services.recommendationsService.updateRecommendation({
      userId: session.user.id,
      recommendationId,
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.deliveredAt !== undefined ? { deliveredAt: body.deliveredAt } : {})
    });
    if (!recommendation) {
      return reply.code(404).send({
        error: {
          code: "RECOMMENDATION_NOT_FOUND",
          message: "Recommendation was not found"
        }
      });
    }

    return recommendationSchema.parse(recommendation);
  });

  app.delete("/v1/recommendations/:recommendationId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const recommendationId = (request.params as { recommendationId: string }).recommendationId;
    const deleted = await app.services.recommendationsService.deleteRecommendation({
      userId: session.user.id,
      recommendationId
    });
    if (!deleted) {
      return reply.code(404).send({
        error: {
          code: "RECOMMENDATION_NOT_FOUND",
          message: "Recommendation was not found"
        }
      });
    }

    return reply.code(204).send();
  });
};

export default recommendationsRoutes;
