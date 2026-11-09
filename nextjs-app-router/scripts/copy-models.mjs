// Copies the face detector assets the SDK loads from `assetBaseUrl` into
// public/models-v3 and checks every file against its pinned sha256.
// The SDK never fetches them from a CDN: your page serves them.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "models-v3");
// @mediapipe/tasks-vision is a dependency of @sekyro/web, pinned to the version it was calibrated with.
const wasmDir = [
  join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  join(root, "node_modules", "@sekyro", "web", "node_modules", "@mediapipe", "tasks-vision", "wasm"),
].find((dir) => existsSync(dir));
if (!wasmDir) throw new Error("@mediapipe/tasks-vision not found: run npm install first");

const FILES = {
  "vision_wasm_internal.js": "e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c",
  "vision_wasm_internal.wasm": "6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc",
  "vision_wasm_nosimd_internal.js": "438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296",
  "vision_wasm_nosimd_internal.wasm": "8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31",
  "blaze_face_short_range.tflite": "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
};
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(out, { recursive: true });
for (const [name, expected] of Object.entries(FILES)) {
  const target = join(out, name);
  if (existsSync(target) && sha256(await readFile(target)) === expected) continue;
  if (name.endsWith(".tflite")) {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Download of ${name} failed: HTTP ${res.status}`);
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
  } else {
    await copyFile(join(wasmDir, name), target);
  }
  const actual = sha256(await readFile(target));
  if (actual !== expected) throw new Error(`${name}: sha256 ${actual} does not match the pin ${expected}`);
}
console.log(`Detector assets ready in ${out}`);
