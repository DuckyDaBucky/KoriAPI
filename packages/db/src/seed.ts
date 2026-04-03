import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDbClient, schema } from "./index.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for seeding`);
  }

  return value;
}

const db = createDbClient(envOrThrow("DATABASE_URL"));
const email = envOrThrow("SEED_USER_EMAIL");
const name = process.env.SEED_USER_NAME ?? "Kori Owner";
const userApiKey = envOrThrow("SEED_USER_API_KEY");

const existingUser = await db.query.users.findFirst({
  where: eq(schema.users.email, email),
});

const userId = existingUser?.id ?? `user_${randomUUID().replaceAll("-", "")}`;

if (!existingUser) {
  await db.insert(schema.users).values({
    id: userId,
    email,
    name,
  });
}

const existingApiKey = await db.query.userApiKeys.findFirst({
  where: and(eq(schema.userApiKeys.userId, userId), eq(schema.userApiKeys.keyHash, sha256(userApiKey))),
});

if (!existingApiKey) {
  await db.insert(schema.userApiKeys).values({
    id: `uak_${randomUUID().replaceAll("-", "")}`,
    label: "default-device-bootstrap",
    keyHash: sha256(userApiKey),
    isActive: true,
    userId,
  });
}

console.log(`Seeded user ${email} with bootstrap API key.`);
