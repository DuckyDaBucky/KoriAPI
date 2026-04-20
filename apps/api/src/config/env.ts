import { existsSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

const envPaths = [
  join(process.cwd(), ".env"),
  join(process.cwd(), "apps", "api", ".env")
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath, override: false });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PUBLIC_WS_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_BASE_URL: z.string().url().optional(),
  APP_ENCRYPTION_KEY: z.string().min(16).default("kori-development-encryption-key"),
  ADMIN_API_KEY: z.string().min(16).default("kori-development-admin-key"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),
  SPOTIFY_SCOPES: z.string().default("user-read-currently-playing user-read-playback-state")
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): AppEnv {
  return envSchema.parse({
    ...process.env,
    ...overrides
  });
}
