import type { FastifyPluginAsync } from "fastify";
import {
  noteCreateRequestSchema,
  noteRevisionCreateRequestSchema,
  noteRevisionSchema,
  noteSchema
} from "@kori/shared";
import { requireUserSession } from "../utils/admin-auth.js";

const notesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/notes", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const notes = await app.services.notesService.listNotes({ userId: session.user.id });
    return notes.map((note) => noteSchema.parse(note));
  });

  app.post("/v1/notes", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = noteCreateRequestSchema.parse(request.body);
    const workspaceAllowed = session.user.workspaces.some((workspace) => workspace.id === body.workspaceId);
    if (!workspaceAllowed) {
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN_WORKSPACE",
          message: "You do not have access to that workspace"
        }
      });
    }

    const note = await app.services.notesService.createNote({
      workspaceId: body.workspaceId,
      userId: session.user.id,
      title: body.title,
      type: body.type,
      content: body.content
    });

    return reply.code(201).send(noteSchema.parse(note));
  });

  app.get("/v1/notes/:noteId/revisions", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const noteId = (request.params as { noteId: string }).noteId;
    const revisions = await app.services.notesService.listRevisions(noteId);
    return revisions.map((revision) => noteRevisionSchema.parse(revision));
  });

  app.post("/v1/notes/:noteId/revisions", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const noteId = (request.params as { noteId: string }).noteId;
    const body = noteRevisionCreateRequestSchema.parse(request.body);
    const revision = await app.services.notesService.createRevision({
      noteId,
      userId: session.user.id,
      content: body.content
    });

    return reply.code(201).send(noteRevisionSchema.parse(revision));
  });
};

export default notesRoutes;
