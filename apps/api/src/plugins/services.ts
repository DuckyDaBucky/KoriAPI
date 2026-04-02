import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type {
  BootstrapService,
  DeviceAuthService,
  HealthService,
  LiveStateService,
  NotificationEventService,
  SensorIngestionService
} from "../services/types.js";

export interface AppServices {
  bootstrapService: BootstrapService;
  deviceAuthService: DeviceAuthService;
  healthService: HealthService;
  liveStateService: LiveStateService;
  sensorIngestionService: SensorIngestionService;
  notificationEventService: NotificationEventService;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
    betterAuthStub: {
      enabled: boolean;
      baseUrl?: string | undefined;
    };
  }
}

const servicesPlugin: FastifyPluginAsync<{ services: AppServices }> = async (app, options) => {
  app.decorate("services", options.services);
};

export default fp(servicesPlugin);
