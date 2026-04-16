import type { FastifyPluginAsync } from "fastify";
import { workspaceSchema } from "@kori/shared";
import { requireUserSession } from "../utils/admin-auth.js";

const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/workspaces", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const workspaces = await app.services.workspaceService.listForUser(session.user.id);
    return workspaces.map((workspace) => workspaceSchema.parse(workspace));
  });
};

export default workspaceRoutes;
