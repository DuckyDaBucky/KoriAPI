import { config as loadDotEnv } from "dotenv";

loadDotEnv();
loadDotEnv({ path: "apps/api/.env", override: false });

const jobKinds = [
  "connector:crossref",
  "connector:orcid",
  "connector:semantic-scholar",
  "spotify:refresh",
  "telemetry:rollup",
  "recommendation:fanout",
  "audit:compact"
];

console.log("Kori worker bootstrap");
console.log("Configured jobs:");
for (const kind of jobKinds) {
  console.log(`- ${kind}`);
}

console.log("This worker scaffold is ready for queue polling, connector execution, rollups, and audit compaction.");
