import type { IncomingMessage } from "node:http";

const TENANT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function normalizeTenantId(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  if (TENANT_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTenantFromQuery(req: IncomingMessage): string | undefined {
  const host = headerValue(req.headers.host) ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  return (
    normalizeTenantId(url.searchParams.get("tenant")) ??
    normalizeTenantId(url.searchParams.get("tenantId"))
  );
}

export function resolveTenantIdFromRequest(req: IncomingMessage): string | undefined {
  return (
    normalizeTenantId(headerValue(req.headers["x-openclaw-tenant"])) ??
    normalizeTenantId(headerValue(req.headers["x-tenant-id"])) ??
    resolveTenantFromQuery(req)
  );
}
