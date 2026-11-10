// Runs the Angular CLI with EXAMPLE_SERVER_URL from the environment or .env (default http://localhost:4000), passed
// to the build as a compile-time constant (`--define`).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const serverUrl = process.env.EXAMPLE_SERVER_URL || "http://localhost:4000";
const [command, ...rest] = process.argv.slice(2);
const res = spawnSync("npx", ["ng", command, "--define", `EXAMPLE_SERVER_URL=${JSON.stringify(serverUrl)}`, ...rest], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);
