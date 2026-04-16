import { createHash, randomUUID, scryptSync, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDbClient, schema } from "./index.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, 64).toString("base64url");
  return `${salt}:${derived}`;
}

function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for seeding`);
  }

  return value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const db = createDbClient(envOrThrow("DATABASE_URL"));
const email = envOrThrow("SEED_USER_EMAIL");
const name = process.env.SEED_USER_NAME ?? "Kori Owner";
const password = process.env.SEED_USER_PASSWORD ?? "ChangeMe123!";
const userApiKey = envOrThrow("SEED_USER_API_KEY");
const workspaceName = process.env.SEED_WORKSPACE_NAME ?? "Kori Default Workspace";

const existingUser = await db.query.users.findFirst({
  where: eq(schema.users.email, email)
});

const userId = existingUser?.id ?? `user_${randomUUID().replaceAll("-", "")}`;

if (!existingUser) {
  await db.insert(schema.users).values({
    id: userId,
    email,
    name,
    passwordHash: hashPassword(password)
  });
} else if (!existingUser.passwordHash) {
  await db
    .update(schema.users)
    .set({
      passwordHash: hashPassword(password),
      updatedAt: new Date()
    })
    .where(eq(schema.users.id, userId));
}

const workspaceSlug = slugify(workspaceName);
const existingWorkspace = await db.query.workspaces.findFirst({
  where: eq(schema.workspaces.slug, workspaceSlug)
});

const workspaceId = existingWorkspace?.id ?? `ws_${randomUUID().replaceAll("-", "")}`;

if (!existingWorkspace) {
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: workspaceName,
    slug: workspaceSlug
  });
}

const existingMembership = await db.query.workspaceMemberships.findFirst({
  where: and(
    eq(schema.workspaceMemberships.workspaceId, workspaceId),
    eq(schema.workspaceMemberships.userId, userId)
  )
});

if (!existingMembership) {
  await db.insert(schema.workspaceMemberships).values({
    id: `wm_${randomUUID().replaceAll("-", "")}`,
    workspaceId,
    userId,
    role: "platform_admin"
  });
}

const existingQuota = await db.query.quotas.findFirst({
  where: eq(schema.quotas.workspaceId, workspaceId)
});

if (!existingQuota) {
  await db.insert(schema.quotas).values({
    id: `quota_${randomUUID().replaceAll("-", "")}`,
    workspaceId,
    storageMb: 4096,
    deviceLimit: 25,
    monthlyAiTokens: 500000
  });
}

const existingApiKey = await db.query.userApiKeys.findFirst({
  where: and(eq(schema.userApiKeys.userId, userId), eq(schema.userApiKeys.keyHash, sha256(userApiKey)))
});

if (!existingApiKey) {
  await db.insert(schema.userApiKeys).values({
    id: `uak_${randomUUID().replaceAll("-", "")}`,
    label: "default-device-bootstrap",
    keyHash: sha256(userApiKey),
    isActive: true,
    userId
  });
}

console.log(`Seeded user ${email} with workspace ${workspaceName}, password auth, and bootstrap API key.`);
