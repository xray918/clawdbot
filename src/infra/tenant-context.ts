import { AsyncLocalStorage } from "node:async_hooks";

type TenantContext = {
  tenantId?: string;
};

const tenantStorage = new AsyncLocalStorage<TenantContext>();

function normalizeTenantId(raw?: string | null): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function withTenantContext<T>(tenantId: string | undefined, fn: () => T): T {
  return tenantStorage.run({ tenantId: normalizeTenantId(tenantId) }, fn);
}

export function getTenantContextId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}
