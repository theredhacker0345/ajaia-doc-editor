#!/usr/bin/env node
/**
 * Zero-touch CI provisioning for Ajaia Docs.
 *
 * Runs as part of `npm run build` AFTER `vite build`, but ONLY activates when
 * Cloudflare credentials are present in the environment (i.e. inside
 * Cloudflare Workers Builds). Local `npm run build` / `npm run dev` skip it.
 *
 * What it does (all steps idempotent):
 *   1. Creates the D1 database `ajaia-docs` if missing, wires its uuid into
 *      wrangler.jsonc for this deploy (build copy only — nothing committed).
 *   2. Applies migrations: 0001 (idempotent schema), 0002 (gated via a
 *      pragma check so it runs exactly once per database).
 *   3. Seeds the 4 demo users, but only when the users table is empty.
 *   4. Deploys the Worker (`wrangler deploy`) so the script exists, then
 *      generates a 384-bit APP_SECRET and stores it as a real Worker secret
 *      (never committed, never logged).
 *
 * Why deploy here? Workers Builds' own deploy command (`npx wrangler deploy`)
 * runs after this script and simply re-deploys the same bundle; deploying once
 * first guarantees the Worker exists before `wrangler secret put` runs.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const DB_NAME = "ajaia-docs";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const log = (...a) => console.log("[provision]", ...a);
const warn = (...a) => console.warn("[provision]", ...a);

// --- Gate: only run when Cloudflare credentials are available (CI builds) ---
const hasCreds = Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN);
if (!hasCreds) {
  log("no Cloudflare credentials in environment — skipping (local dev).");
  process.exit(0);
}

function wr(args, extra = {}) {
  const r = spawnSync("npx", ["--no-install", "wrangler", ...args], {
    encoding: "utf8",
    ...extra,
  });
  if (r.error) throw r.error;
  return {
    code: r.status ?? 1,
    out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
    stdout: r.stdout ?? "",
  };
}

const run = (args, label) => {
  const r = wr(args);
  if (r.code !== 0) throw new Error(`${label} failed:\n${r.out.slice(-900)}`);
  return r;
};

function parseJsonArray(stdout) {
  const m = stdout.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Run a read query against the remote D1 database; returns rows array. */
function d1Query(sql) {
  const r = run(
    ["d1", "execute", DB_NAME, "--remote", "-y", "--json", "--command", sql],
    `d1 query: ${sql.slice(0, 60)}`
  );
  const parsed = parseJsonArray(r.stdout);
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    if (first && Array.isArray(first.results)) return first.results;
    return parsed;
  }
  const c = r.stdout.match(/"c"\s*:\s*(\d+)/);
  return c ? [{ c: Number(c[1]) }] : [];
}

const scalar = (sql) => d1Query(sql)?.[0]?.c ?? 0;

try {
  // --- 1. D1 database: locate or create -----------------------------------
  const listDbs = () => {
    const r = run(["d1", "list", "--json"], "d1 list");
    return parseJsonArray(r.stdout) ?? [];
  };
  let db = listDbs().find((d) => d && d.name === DB_NAME);
  if (!db) {
    log(`D1 database "${DB_NAME}" not found — creating…`);
    const created = wr(["d1", "create", DB_NAME]);
    if (created.code !== 0 && !/already exists/i.test(created.out)) {
      throw new Error(`d1 create failed:\n${created.out.slice(-900)}`);
    }
    db = listDbs().find((d) => d && d.name === DB_NAME);
  }
  if (!db?.uuid) throw new Error("could not locate the D1 database after create");
  log(`D1 database ready: ${DB_NAME} (${db.uuid})`);

  // --- 2. Wire database_id into wrangler.jsonc (build copy only) ----------
  const cfgPath = "wrangler.jsonc";
  const cfg = readFileSync(cfgPath, "utf8");
  if (cfg.includes(PLACEHOLDER)) {
    writeFileSync(cfgPath, cfg.replace(PLACEHOLDER, db.uuid));
    log("wrangler.jsonc: database_id wired for this deploy.");
  }

  // --- 3. Migrations + seed (idempotent; each gated migration runs exactly once) ---
  run(["d1", "execute", DB_NAME, "--remote", "-y", "--file", "./migrations/0001_init.sql"], "migration 0001");
  log("migration 0001 (schema) applied/verified.");

  const columnExists = (table, column) =>
    scalar(`SELECT COUNT(*) AS c FROM pragma_table_info('${table}') WHERE name='${column}'`) > 0;

  if (columnExists("users", "bio")) {
    log("migration 0002 (profile + ALTCHA ledger) already applied — skipped.");
  } else {
    run(["d1", "execute", DB_NAME, "--remote", "-y", "--file", "./migrations/0002_profile.sql"], "migration 0002");
    log("migration 0002 (profile + ALTCHA ledger) applied.");
  }

  if (columnExists("document_access", "can_share")) {
    log("migration 0003 (version history + sharing) already applied — skipped.");
  } else {
    run(["d1", "execute", DB_NAME, "--remote", "-y", "--file", "./migrations/0003_versions_sharing.sql"], "migration 0003");
    log("migration 0003 (version history + sharing) applied.");
  }

  const userCount = scalar("SELECT COUNT(*) AS c FROM users");
  if (userCount > 0) {
    log(`seed skipped — users table already has ${userCount} row(s).`);
  } else {
    run(["d1", "execute", DB_NAME, "--remote", "-y", "--file", "./migrations/seed.sql"], "seed");
    log("seeded 4 demo users.");
  }

  // --- 4. Deploy, then set APP_SECRET as a real secret --------------------
  const deployed = run(["deploy"], "wrangler deploy (provisioning)");
  const url = deployed.stdout.match(/https:\/\/[a-z0-9-]+\.workers\.dev/i)?.[0];
  log(`Worker deployed${url ? ` -> ${url}` : ""}.`);

  const secretList = wr(["secret", "list"]);
  if (secretList.code === 0 && /APP_SECRET/.test(secretList.stdout)) {
    log("APP_SECRET already set — skipped.");
  } else {
    const value = randomBytes(48).toString("base64url"); // generated, never printed
    const put = spawnSync(
      "npx",
      ["--no-install", "wrangler", "secret", "put", "APP_SECRET"],
      { input: `${value}\n`, encoding: "utf8" }
    );
    if (put.status === 0) {
      log("APP_SECRET generated and stored as a Worker secret.");
    } else {
      warn(
        "could not store APP_SECRET this run — will retry on next build. Details:",
        (put.stderr || put.stdout || "").slice(-400)
      );
    }
  }

  log("provisioning complete.");
} catch (err) {
  console.error("[provision] FAILED:", err?.message ?? err);
  process.exit(1);
}
