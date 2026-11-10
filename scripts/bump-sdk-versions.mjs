#!/usr/bin/env node
// Moves every SDK pin in examples/ to the latest published release:
// npm `next` for @sekyro/*, Maven Central for ai.sekyro:sekyro-bom, pub.dev
// for sekyro_flutter, the sekyro-ios-dist tags for SekyroKit.
//
//   node examples/scripts/bump-sdk-versions.mjs [--dry-run]
//
// Prints each pin it moves. After a real run, refresh the lock files of the
// samples it touched (npm install, flutter pub get) and open a PR.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const npmNext = async (name) => (await getJson(`https://registry.npmjs.org/-/package/${name}/dist-tags`)).next;
const pubLatest = async (name) => (await getJson(`https://pub.dev/api/packages/${name}`)).latest.version;
const mavenLatest = async (group, artifact) => {
  const xml = await getText(`https://repo1.maven.org/maven2/${group.replaceAll(".", "/")}/${artifact}/maven-metadata.xml`);
  const latest = /<latest>([^<]+)<\/latest>/.exec(xml)?.[1];
  if (!latest) throw new Error(`${group}:${artifact}: no <latest> in maven-metadata.xml`);
  return latest;
};

/** Semver order with prerelease identifiers compared numerically where they are numbers. */
function compareVersions(a, b) {
  const [ac, ap = ""] = a.split("-", 2);
  const [bc, bp = ""] = b.split("-", 2);
  const core = (v) => v.split(".").map(Number);
  for (const [x, y] of core(ac).map((n, i) => [n, core(bc)[i] ?? 0])) if (x !== y) return x - y;
  if (ap === "" || bp === "") return ap === bp ? 0 : ap === "" ? 1 : -1;
  const ai = ap.split(".");
  const bi = bp.split(".");
  for (let i = 0; i < Math.max(ai.length, bi.length); i++) {
    const x = ai[i];
    const y = bi[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    return Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
  }
  return 0;
}

function iosDistLatest() {
  const out = execFileSync("git", ["ls-remote", "--tags", "--refs", "https://github.com/IBTIKAR-Technologies/sekyro-ios-dist"], { encoding: "utf8" });
  const tags = [...out.matchAll(/refs\/tags\/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/gm)].map((m) => m[1]);
  if (tags.length === 0) throw new Error("sekyro-ios-dist: no version tags");
  return tags.sort(compareVersions).at(-1);
}

const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;

/** Each pin: where it is written and how to find it. Missing files are skipped (a sample not merged yet). */
const npmPin = (pkg) => ({ pattern: new RegExp(String.raw`("${pkg.replace("/", "\\/")}":\s*")(${VERSION})(")`, "g") });
const PINS = [
  ...["@sekyro/node", "@sekyro/web", "@sekyro/react", "@sekyro/react-native", "@sekyro/cli"].map((pkg) => ({
    label: pkg,
    latest: () => npmNext(pkg),
    files: ["node-express", "web-vanilla", "react-vite", "nextjs-app-router", "vue", "angular", "react-native"].map((s) => `${s}/package.json`),
    ...npmPin(pkg),
  })),
  {
    label: "ai.sekyro:sekyro-bom",
    latest: () => mavenLatest("ai.sekyro", "sekyro-bom"),
    files: ["android-compose/app/build.gradle.kts"],
    pattern: new RegExp(String.raw`(ai\.sekyro:sekyro-bom:)(${VERSION})(")`, "g"),
  },
  {
    label: "sekyro_flutter",
    latest: () => pubLatest("sekyro_flutter"),
    files: ["flutter/pubspec.yaml"],
    pattern: new RegExp(String.raw`(^\s+sekyro_flutter:\s*)(${VERSION})($)`, "gm"),
  },
  {
    label: "SekyroKit (sekyro-ios-dist)",
    latest: async () => iosDistLatest(),
    files: ["ios-swiftui/project.yml"],
    pattern: new RegExp(String.raw`(exactVersion:\s*)(${VERSION})($)`, "gm"),
  },
  {
    label: "SekyroKit podspec (sekyro-ios-dist)",
    latest: async () => iosDistLatest(),
    files: ["flutter/ios/Podfile", "ios-swiftui/README.md"],
    pattern: new RegExp(String.raw`(sekyro-ios-dist\/|\`)(${VERSION})(\/SekyroKit\.podspec|\`)`, "g"),
  },
];

let moved = 0;
for (const pin of PINS) {
  const latest = await pin.latest();
  for (const rel of pin.files) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const before = readFileSync(file, "utf8");
    const after = before.replace(pin.pattern, (match, head, version, tail) => {
      if (version === latest) return match;
      console.log(`${rel}: ${pin.label} ${version} -> ${latest}`);
      moved++;
      return `${head}${latest}${tail}`;
    });
    if (after !== before && !dryRun) writeFileSync(file, after);
  }
}

console.log(
  moved === 0
    ? "Every pin is on the latest release."
    : `${moved} pin(s) ${dryRun ? "would move (dry run, nothing written)" : "moved: refresh the lock files (npm install, flutter pub get) and open a PR"}.`,
);
