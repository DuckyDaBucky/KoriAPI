import { type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";
type DatabaseInstance = NeonDatabase<typeof schema>;
export declare function createDbClient(connectionString?: string): DatabaseInstance;
export declare function closeDb(): Promise<void>;
export { schema };
export type { DatabaseInstance };
//# sourceMappingURL=index.d.ts.map