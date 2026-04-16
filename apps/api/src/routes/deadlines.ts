import type { FastifyPluginAsync } from "fastify";
import { deadlineCreateRequestSchema, deadlineSchema } from "@kori/shared";
import { requireUserSession } from "../utils/admin-auth.js";

const deadlinesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/deadlines", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const deadlines = await app.services.deadlinesService.listDeadlines({ userId: session.user.id });
    return deadlines.map((deadline) => deadlineSchema.parse(deadline));
  });

  app.post("/v1/deadlines", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = deadlineCreateRequestSchema.parse(request.body);
    const workspaceAllowed = session.user.workspaces.some((workspace) => workspace.id === body.workspaceId);
    if (!workspaceAllowed) {
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN_WORKSPACE",
          message: "You do not have access to that workspace"
        }
      });
    }

    const deadline = await app.services.deadlinesService.createDeadline({
      workspaceId: body.workspaceId,
      userId: session.user.id,
      title: body.title,
      dueAt: body.dueAt,
      metadata: body.metadata
    });

    return reply.code(201).send(deadlineSchema.parse(deadline));
  });
};

export default deadlinesRoutes;
