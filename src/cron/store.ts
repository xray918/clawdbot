import JSON5 from "json5";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CronStoreFile } from "./types.js";
import { resolveTenantStateDir } from "../config/paths.js";
import { CONFIG_DIR } from "../utils.js";

export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");
export const DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json");
const TENANT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function resolveCronStorePath(storePath?: string) {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(raw.replace("~", os.homedir()));
    }
    return path.resolve(raw);
  }
  return DEFAULT_CRON_STORE_PATH;
}

export function resolveTenantCronStorePath(params: {
  tenantId?: string | null;
  storePath?: string;
}): string {
  const tenantId = (params.tenantId ?? "").trim();
  if (!tenantId || !TENANT_ID_RE.test(tenantId)) {
    return resolveCronStorePath(params.storePath);
  }
  const normalized = tenantId.toLowerCase();
  if (params.storePath?.includes("{tenantId}")) {
    return resolveCronStorePath(params.storePath.replaceAll("{tenantId}", normalized));
  }
  const tenantRoot = resolveTenantStateDir(normalized);
  return path.join(tenantRoot, "cron", "jobs.json");
}

export async function loadCronStore(storePath: string): Promise<CronStoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON5.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? (parsed?.jobs as never[]) : [];
    return {
      version: 1,
      jobs: jobs.filter(Boolean) as never as CronStoreFile["jobs"],
    };
  } catch {
    return { version: 1, jobs: [] };
  }
}

export async function saveCronStore(storePath: string, store: CronStoreFile) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, storePath);
  try {
    await fs.promises.copyFile(storePath, `${storePath}.bak`);
  } catch {
    // best-effort
  }
}
