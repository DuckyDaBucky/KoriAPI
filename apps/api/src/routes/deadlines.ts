import type { FastifyPluginAsync } from "fastify";
import { deadlineCreateRequestSchema, deadlineSchema, deadlineUpdateRequestSchema } from "@kori/shared";
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

  app.get("/v1/deadlines/:deadlineId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const deadlineId = (request.params as { deadlineId: string }).deadlineId;
    const deadline = await app.services.deadlinesService.getDeadline({
      userId: session.user.id,
      deadlineId
    });
    if (!deadline) {
      return reply.code(404).send({
        error: {
          code: "DEADLINE_NOT_FOUND",
          message: "Deadline was not found"
        }
      });
    }

    return deadlineSchema.parse(deadline);
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

  app.patch("/v1/deadlines/:deadlineId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const deadlineId = (request.params as { deadlineId: string }).deadlineId;
    const body = deadlineUpdateRequestSchema.parse(request.body);
    const deadline = await app.services.deadlinesService.updateDeadline({
      userId: session.user.id,
      deadlineId,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {})
    });
    if (!deadline) {
      return reply.code(404).send({
        error: {
          code: "DEADLINE_NOT_FOUND",
          message: "Deadline was not found"
        }
      });
    }

    return deadlineSchema.parse(deadline);
  });

  app.delete("/v1/deadlines/:deadlineId", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const deadlineId = (request.params as { deadlineId: string }).deadlineId;
    const deleted = await app.services.deadlinesService.deleteDeadline({
      userId: session.user.id,
      deadlineId
    });
    if (!deleted) {
      return reply.code(404).send({
        error: {
          code: "DEADLINE_NOT_FOUND",
          message: "Deadline was not found"
        }
      });
    }

    return reply.code(204).send();
  });
};

export default deadlinesRoutes;
