import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";

const dashboardRoot = join(process.cwd(), "apps", "dashboard");

async function readDashboardAsset(filename: string): Promise<string> {
  return readFile(join(dashboardRoot, filename), "utf8");
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/dashboard", async (_request, reply) => {
    return reply.type("text/html").send(await readDashboardAsset("index.html"));
  });

  app.get("/admin/dashboard/app.js", async (_request, reply) => {
    return reply.type("application/javascript").send(await readDashboardAsset("app.js"));
  });

  app.get("/admin/dashboard/styles.css", async (_request, reply) => {
    return reply.type("text/css").send(await readDashboardAsset("styles.css"));
  });
};

export default dashboardRoutes;
