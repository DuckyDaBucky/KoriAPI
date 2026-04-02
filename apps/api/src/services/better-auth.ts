import type { FastifyInstance } from "fastify";

export interface BetterAuthStub {
  enabled: boolean;
  baseUrl?: string | undefined;
}

export function createBetterAuthStub(options: {
  secret?: string | undefined;
  baseUrl?: string | undefined;
}): BetterAuthStub {
  const stub: BetterAuthStub = {
    enabled: Boolean(options.secret && options.baseUrl)
  };

  if (options.baseUrl) {
    stub.baseUrl = options.baseUrl;
  }

  return stub;
}

export async function registerBetterAuthStub(
  app: FastifyInstance,
  auth: BetterAuthStub
): Promise<void> {
  if (!auth.enabled) {
    app.log.warn("better-auth stub disabled: BETTER_AUTH_SECRET or BETTER_AUTH_BASE_URL missing");
  }

  app.decorate("betterAuthStub", auth);
}
