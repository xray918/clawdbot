import os from "node:os";
import path from "node:path";
import type { SessionEntry } from "./types.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveStateDir, resolveTenantStateDir } from "../paths.js";

function resolveAgentSessionsDir(
  agentId?: string,
  tenantId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const root = tenantId
    ? resolveTenantStateDir(tenantId, env, homedir)
    : resolveStateDir(env, homedir);
  const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
  return path.join(root, "agents", id, "sessions");
}

export function resolveSessionTranscriptsDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveAgentSessionsDir(DEFAULT_AGENT_ID, undefined, env, homedir);
}

export function resolveSessionTranscriptsDirForAgent(
  agentId?: string,
  tenantId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  return resolveAgentSessionsDir(agentId, tenantId, env, homedir);
}

export function resolveDefaultSessionStorePath(agentId?: string, tenantId?: string): string {
  return path.join(resolveAgentSessionsDir(agentId, tenantId), "sessions.json");
}

export function resolveSessionTranscriptPath(
  sessionId: string,
  agentId?: string,
  tenantId?: string,
  topicId?: string | number,
): string {
  const safeTopicId =
    typeof topicId === "string"
      ? encodeURIComponent(topicId)
      : typeof topicId === "number"
        ? String(topicId)
        : undefined;
  const fileName =
    safeTopicId !== undefined ? `${sessionId}-topic-${safeTopicId}.jsonl` : `${sessionId}.jsonl`;
  return path.join(resolveAgentSessionsDir(agentId, tenantId), fileName);
}

export function resolveSessionFilePath(
  sessionId: string,
  entry?: SessionEntry,
  opts?: { agentId?: string; tenantId?: string },
): string {
  const candidate = entry?.sessionFile?.trim();
  return candidate
    ? candidate
    : resolveSessionTranscriptPath(sessionId, opts?.agentId, opts?.tenantId);
}

export function resolveStorePath(store?: string, opts?: { agentId?: string; tenantId?: string }) {
  const agentId = normalizeAgentId(opts?.agentId ?? DEFAULT_AGENT_ID);
  if (!store) {
    return resolveDefaultSessionStorePath(agentId, opts?.tenantId);
  }
  if (store.includes("{agentId}")) {
    const expanded = store.replaceAll("{agentId}", agentId);
    if (expanded.startsWith("~")) {
      return path.resolve(expanded.replace(/^~(?=$|[\\/])/, os.homedir()));
    }
    return path.resolve(expanded);
  }
  if (store.startsWith("~")) {
    return path.resolve(store.replace(/^~(?=$|[\\/])/, os.homedir()));
  }
  return path.resolve(store);
}
