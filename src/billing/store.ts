import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveTenantStateDir } from "../config/paths.js";

export type BillingState = {
  version: 1;
  lastResetDay: string | null;
  dailyFreeTokensUsed: number;
  tokenBalance: number;
  totalTokensConsumed: number;
};

export type BillingStatus = {
  state: BillingState;
  dailyFreeTokens: number;
  freeTokensRemaining: number;
  enabled: boolean;
};

type BillingChargeResult = {
  ok: boolean;
  state: BillingState;
  reason?: string;
  chargedTokens?: number;
};

const BILLING_STATE_VERSION = 1;

function normalizeTenantId(tenantId?: string | null): string | null {
  const trimmed = (tenantId ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function resolveTenantBillingPath(tenantId: string): string {
  const root = resolveTenantStateDir(tenantId);
  return path.join(root, "billing", "state.json");
}

function resolveTenantPurchaseLogPath(tenantId: string): string {
  const root = resolveTenantStateDir(tenantId);
  return path.join(root, "billing", "purchases.jsonl");
}

function localDayKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadBillingState(tenantId: string, cfg: OpenClawConfig): Promise<BillingState> {
  const billingPath = resolveTenantBillingPath(tenantId);
  try {
    const raw = await fs.readFile(billingPath, "utf-8");
    const parsed = JSON.parse(raw) as BillingState;
    if (parsed?.version === BILLING_STATE_VERSION) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {
    version: BILLING_STATE_VERSION,
    lastResetDay: null,
    dailyFreeTokensUsed: 0,
    tokenBalance: Math.max(0, Math.floor(cfg.billing?.initialTokenBalance ?? 0)),
    totalTokensConsumed: 0,
  };
}

async function saveBillingState(tenantId: string, state: BillingState): Promise<void> {
  const billingPath = resolveTenantBillingPath(tenantId);
  await fs.mkdir(path.dirname(billingPath), { recursive: true });
  const tmp = `${billingPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmp, billingPath);
}

async function appendPurchaseRecord(
  tenantId: string,
  record: Record<string, unknown>,
): Promise<void> {
  const logPath = resolveTenantPurchaseLogPath(tenantId);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, "utf-8");
}

function applyDailyReset(state: BillingState, now: Date): BillingState {
  const today = localDayKey(now);
  if (state.lastResetDay !== today) {
    return {
      ...state,
      lastResetDay: today,
      dailyFreeTokensUsed: 0,
    };
  }
  return state;
}

export function estimateTokensForBilling(params: {
  message: string;
  imageCount?: number;
  cfg: OpenClawConfig;
}): number {
  const base = Math.max(1, Math.ceil(params.message.length / 4));
  const outputEstimate = Math.max(0, Math.floor(params.cfg.billing?.estimateOutputTokens ?? 0));
  const imageCount = Math.max(0, Math.floor(params.imageCount ?? 0));
  const imageTokens = Math.max(0, Math.floor(params.cfg.billing?.estimateImageTokens ?? 0));
  return base + outputEstimate + imageCount * imageTokens;
}

export async function getTenantBillingStatus(params: {
  tenantId?: string | null;
  cfg: OpenClawConfig;
}): Promise<{ ok: boolean; status: BillingStatus; reason?: string }> {
  const normalizedTenantId = normalizeTenantId(params.tenantId);
  if (!normalizedTenantId) {
    return {
      ok: false,
      reason: "tenant_id_missing",
      status: {
        state: {
          version: BILLING_STATE_VERSION,
          lastResetDay: null,
          dailyFreeTokensUsed: 0,
          tokenBalance: 0,
          totalTokensConsumed: 0,
        },
        dailyFreeTokens: 0,
        freeTokensRemaining: 0,
        enabled: false,
      },
    };
  }
  const enabled = params.cfg.billing?.enabled === true;
  const dailyFreeTokens = Math.max(0, Math.floor(params.cfg.billing?.dailyFreeTokens ?? 0));
  const now = new Date();
  let state = await loadBillingState(normalizedTenantId, params.cfg);
  state = applyDailyReset(state, now);
  const freeTokensRemaining = Math.max(0, dailyFreeTokens - state.dailyFreeTokensUsed);
  return {
    ok: true,
    status: { state, dailyFreeTokens, freeTokensRemaining, enabled },
  };
}

export async function creditTenantTokens(params: {
  tenantId?: string | null;
  tokens: number;
  cfg: OpenClawConfig;
  orderId?: string;
  packageId?: string;
  packageName?: string;
  priceCny?: number;
}): Promise<{ ok: boolean; state: BillingState; reason?: string }> {
  const normalizedTenantId = normalizeTenantId(params.tenantId);
  if (!normalizedTenantId) {
    return {
      ok: false,
      reason: "tenant_id_missing",
      state: {
        version: BILLING_STATE_VERSION,
        lastResetDay: null,
        dailyFreeTokensUsed: 0,
        tokenBalance: 0,
        totalTokensConsumed: 0,
      },
    };
  }
  const tokens = Math.max(0, Math.floor(params.tokens));
  if (tokens <= 0) {
    const state = await loadBillingState(normalizedTenantId, params.cfg);
    return { ok: false, reason: "invalid_tokens", state };
  }
  const now = new Date();
  let state = await loadBillingState(normalizedTenantId, params.cfg);
  state = applyDailyReset(state, now);
  const nextState: BillingState = {
    ...state,
    tokenBalance: state.tokenBalance + tokens,
  };
  await saveBillingState(normalizedTenantId, nextState);
  await appendPurchaseRecord(normalizedTenantId, {
    ts: now.toISOString(),
    tokens,
    orderId: params.orderId ?? null,
    packageId: params.packageId ?? null,
    packageName: params.packageName ?? null,
    priceCny: params.priceCny ?? null,
  });
  return { ok: true, state: nextState };
}

export async function chargeTenantTokens(params: {
  tenantId?: string | null;
  tokens: number;
  cfg: OpenClawConfig;
}): Promise<BillingChargeResult> {
  if (params.tokens <= 0) {
    return {
      ok: true,
      state: {
        version: BILLING_STATE_VERSION,
        lastResetDay: null,
        dailyFreeTokensUsed: 0,
        tokenBalance: Math.max(0, Math.floor(params.cfg.billing?.initialTokenBalance ?? 0)),
        totalTokensConsumed: 0,
      },
      chargedTokens: 0,
    };
  }
  if (params.cfg.billing?.enabled !== true) {
    return {
      ok: true,
      state: {
        version: BILLING_STATE_VERSION,
        lastResetDay: null,
        dailyFreeTokensUsed: 0,
        tokenBalance: Math.max(0, Math.floor(params.cfg.billing?.initialTokenBalance ?? 0)),
        totalTokensConsumed: 0,
      },
      chargedTokens: 0,
    };
  }
  const normalizedTenantId = normalizeTenantId(params.tenantId);
  if (!normalizedTenantId) {
    return {
      ok: false,
      reason: "tenant_id_missing",
      state: {
        version: BILLING_STATE_VERSION,
        lastResetDay: null,
        dailyFreeTokensUsed: 0,
        tokenBalance: 0,
        totalTokensConsumed: 0,
      },
    };
  }
  const now = new Date();
  const dailyFreeTokens = Math.max(0, Math.floor(params.cfg.billing?.dailyFreeTokens ?? 0));
  let state = await loadBillingState(normalizedTenantId, params.cfg);
  state = applyDailyReset(state, now);

  const freeRemaining = Math.max(0, dailyFreeTokens - state.dailyFreeTokensUsed);
  const freeUsed = Math.min(freeRemaining, params.tokens);
  const remainingToCharge = params.tokens - freeUsed;
  if (remainingToCharge > state.tokenBalance) {
    return { ok: false, reason: "insufficient_balance", state };
  }

  const nextState: BillingState = {
    ...state,
    dailyFreeTokensUsed: state.dailyFreeTokensUsed + freeUsed,
    tokenBalance: state.tokenBalance - remainingToCharge,
    totalTokensConsumed: state.totalTokensConsumed + params.tokens,
  };
  await saveBillingState(normalizedTenantId, nextState);
  return { ok: true, state: nextState, chargedTokens: params.tokens };
}
