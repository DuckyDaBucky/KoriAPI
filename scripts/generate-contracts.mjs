import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAsyncApiDocument, buildOpenApiDocument } from "../apps/api/dist/src/contracts.js";

const outputDir = join(process.cwd(), "artifacts", "contracts");
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "openapi.json"), JSON.stringify(buildOpenApiDocument(), null, 2));
await writeFile(join(outputDir, "asyncapi.json"), JSON.stringify(buildAsyncApiDocument(), null, 2));
console.log(`Generated contracts in ${outputDir}`);
