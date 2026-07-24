// Predeploy: zapise aktualni git commit + cas buildu do src/version.ts.
// Spousti se automaticky pres `npm run deploy` (npm predeploy hook).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let commit = "dev";
try {
  commit = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  /* mimo git */
}
const built = new Date().toISOString();

const out = `// GENEROVANO scripts/gen-version.mjs (predeploy) — needitovat rucne.
export const VERSION = { commit: ${JSON.stringify(commit)}, built: ${JSON.stringify(built)} };
`;
writeFileSync(new URL("../src/version.ts", import.meta.url), out);
console.log("version:", commit, built);
