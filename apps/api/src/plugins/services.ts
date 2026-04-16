import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type {
  AuditService,
  AuthService,
  BootstrapService,
  DeviceAuthService,
  DeviceRegistryService,
  HealthService,
  LiveStateService,
  NotificationEventService,
  ObservabilityService,
  ProvisioningCodeService,
  SensorIngestionService,
  SpotifyService,
  WorkspaceService
} from "../services/types.js";

export interface AppServices {
  authService: AuthService;
  bootstrapService: BootstrapService;
  deviceAuthService: DeviceAuthService;
  deviceRegistryService: DeviceRegistryService;
  workspaceService: WorkspaceService;
  provisioningCodeService: ProvisioningCodeService;
  healthService: HealthService;
  liveStateService: LiveStateService;
  sensorIngestionService: SensorIngestionService;
  notificationEventService: NotificationEventService;
  auditService: AuditService;
  observabilityService: ObservabilityService;
  spotifyService: SpotifyService;
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
