import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema.js";

neonConfig.webSocketConstructor = ws as typeof neonConfig.webSocketConstructor;

type DatabaseInstance = NeonDatabase<typeof schema>;

type DbGlobal = typeof globalThis & {
  __koriPool?: Pool;
  __koriDb?: DatabaseInstance;
};

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return connectionString;
}

export function createDbClient(connectionString = getConnectionString()): DatabaseInstance {
  const globalDb = globalThis as DbGlobal;

  if (process.env.NODE_ENV !== "production" && globalDb.__koriDb) {
    return globalDb.__koriDb;
  }

  const pool =
    process.env.NODE_ENV !== "production" && globalDb.__koriPool
      ? globalDb.__koriPool
      : new Pool({ connectionString });

  const db = drizzle({ client: pool, schema });

  if (process.env.NODE_ENV !== "production") {
    globalDb.__koriPool = pool;
    globalDb.__koriDb = db;
  }

  return db;
}

export async function closeDb(): Promise<void> {
  const globalDb = globalThis as DbGlobal;
  if (globalDb.__koriPool) {
    await globalDb.__koriPool.end();
    delete globalDb.__koriPool;
    delete globalDb.__koriDb;
  }
}

export { schema };
export type { DatabaseInstance };
