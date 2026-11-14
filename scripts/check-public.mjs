#!/usr/bin/env node
// Publication check for examples/: everything here is mirrored to a public
// repository, so nothing private may be in it.
//
//   node examples/scripts/check-public.mjs [dir ...]   (default: the whole examples/ tree)
//
// Fails on: secrets and real data (the docs sync's rules), links to private
// repositories or paths outside the samples, `file:` / `path:` dependencies
// (except tarballs committed under this tree's own vendor/ directory),
// and the Sandbox test API used outside a development-only guard.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const examplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The secret patterns of the docs sync. Real people's numbers are listed by
// sha256 only, so this public file never holds the values it refuses.
const FORBIDDEN = [
  { name: "a live secret key", pattern: /sk_live_[A-Za-z0-9]{8,}/ },
  { name: "a sandbox secret key", pattern: /sk_test_[A-Za-z0-9]{8,}/ },
  { name: "a webhook secret", pattern: /whsec_[A-Za-z0-9]{8,}/ },
  { name: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];
const FORBIDDEN_NUMBERS = new Set(["088f1a2820aee3202ce76ebc5d56ee9d30942c0e40d91cfdf70660fd77c9bbc0"]);

// Links into the organisation are allowed to its public repositories only.
const PUBLIC_REPOS = new Set(["sekyro-examples", "sekyro-ios-dist"]);
const ORG_LINK = /IBTIKAR-Technologies\/([A-Za-z0-9._-]+)/gi;

const PRIVATE = [
  { name: "a path into the monorepo", pattern: /(?:^|[\s"'`(=:])(?:\.\.\/){2,}(?:packages|sekyro-mobile|identity-[a-z]+|docs|e2e)\//m },
  { name: "a monorepo-only path variable", pattern: /SEKYRO_KIT_(?:PATH)/ },
];

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".next", "build", ".gradle", "Pods", ".dart_tool", "DerivedData", ".idea", ".expo", "models-v3",
]);
const BINARY = /\.(?:jar|png|jpe?g|gif|webp|ico|keystore|jks|p12|ttf|otf|woff2?|wasm|tflite|task|so|a|aar|zip|xcuserstate)$/i;
// Lock files list registry URLs and integrity hashes only: scanned for secrets, not for the rules below.
const LOCKFILE = /(?:package-lock\.json|pubspec\.lock|Podfile\.lock|Gemfile\.lock)$/;

function listFiles(dir) {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\0").filter(Boolean).map((f) => join(dir, f)).filter((f) => existsSync(f));
  } catch {
    const files = [];
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        if (SKIP_DIRS.has(name) || name === ".git") continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(dir);
    return files;
  }
}

// A `file:` tarball committed under the published tree's own vendor/ directory resolves for
// public users too (e.g. vendor/deepmerge-4.3.1-cve-2026-93753.tgz, a patched build of a
// dependency with no fixed upstream release). Anything else stays a local dependency.
function isVendoredTarball(pkgFile, spec) {
  const m = /^file:(.+\.tgz)$/.exec(String(spec));
  if (!m) return false;
  const target = resolve(dirname(pkgFile), m[1]);
  return dirname(target) === join(examplesRoot, "vendor") && existsSync(target);
}

const problems = [];
const report = (file, what) => problems.push(`${relative(process.cwd(), file)}: ${what}`);

function checkFile(file) {
  if (BINARY.test(file) || file.split(/[\\/]/).some((part) => SKIP_DIRS.has(part))) return;
  const text = readFileSync(file, "utf8");
  for (const f of FORBIDDEN) if (f.pattern.test(text)) report(file, f.name);
  for (const digits of text.match(/\d{10}/g) ?? []) {
    if (FORBIDDEN_NUMBERS.has(createHash("sha256").update(digits).digest("hex"))) report(file, "a real person's ID number");
  }
  if (LOCKFILE.test(file)) return;
  for (const f of PRIVATE) if (f.pattern.test(text)) report(file, f.name);
  for (const [, repo] of text.matchAll(ORG_LINK)) {
    if (!PUBLIC_REPOS.has(repo.replace(/\.git$/, ""))) report(file, "a link to a private repository of the organisation");
  }

  const name = basename(file);
  if (name === "package.json") {
    const pkg = JSON.parse(text);
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
        if (/^(?:file|link|workspace|portal):/.test(String(spec)) && !isVendoredTarball(file, spec)) {
          report(file, `${dep} is a local dependency (${spec})`);
        }
      }
    }
  }
  if (name === "pubspec.yaml" && /^\s+path:\s/m.test(text)) report(file, "a path: dependency");
  if (name === ".npmrc" && /install-links/.test(text)) report(file, "install-links points at local packages");

  // The Sandbox test API (finish with test data) only behind a development or Sandbox-key guard.
  if (!file.endsWith(".md") && /\bsekyro\(?\)?\.test\.|\.sessions\.simulate\(/.test(text) && !/sk_test_|NODE_ENV/.test(text)) {
    report(file, "calls the Sandbox test API without a Sandbox-key or development guard");
  }
}

const targets = process.argv.slice(2).map((d) => resolve(d));
for (const dir of targets.length > 0 ? targets : [examplesRoot]) {
  if (!existsSync(dir)) {
    problems.push(`${dir}: not found`);
    continue;
  }
  for (const file of listFiles(dir)) checkFile(file);
}

if (problems.length > 0) {
  console.error(`check-public: FAIL\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("check-public: PASS");
