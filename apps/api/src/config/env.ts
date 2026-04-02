import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PUBLIC_WS_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_BASE_URL: z.string().url().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): AppEnv {
  return envSchema.parse({
    ...process.env,
    ...overrides
  });
}
