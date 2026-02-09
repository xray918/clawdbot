---
summary: "Feasibility assessment for multi-tenant SaaS on a single gateway"
title: "Multi-Tenant Feasibility"
---

# Multi-Tenant Feasibility (Single Gateway)

This document evaluates feasibility for running OpenClaw as a multi-tenant SaaS on a single
gateway process (Alibaba Cloud), with OAuth login, billing, per-tenant workspace/memory, and
an operator/admin UI. OAuth is assumed to be delegated to the mcpmarket service (GitHub,
Gmail, WeChat). It does not implement code changes.

## Current architecture anchors

- HTTP entry: `src/gateway/server-http.ts` routes to hooks, tools, providers, and UI.
- WebSocket entry: `src/gateway/server/ws-connection.ts` handles handshake and request routing.
- Auth: `src/gateway/auth.ts` (token/password/tailscale) with method-level scopes in
  `src/gateway/server-methods.ts`.
- Session store and transcripts: `src/config/sessions/paths.ts` + `src/config/sessions/store.ts`.
- Agent workspace isolation: `src/agents/agent-scope.ts` + `src/agents/workspace.ts`.
- Usage summaries: `src/gateway/server-methods/usage.ts` and `src/infra/session-cost-usage.ts`.

## Feasibility summary

Multi-tenant is feasible with a single gateway, but requires end-to-end tenant context
propagation, stricter authz boundaries, and durable storage isolation. The existing agent
and session keying provides a good base for per-tenant isolation but is not sufficient on
its own without a tenant layer.

## Proposed tenant model

Minimal entities:

- Tenant: billing unit and isolation domain.
- User: human identity from mcpmarket OAuth, belonging to one or more tenants.
- Role: `owner`, `admin`, `member`, `readonly` (mapped to gateway scopes).
- Agent: per-tenant agent configs (already supported by OpenClaw, but not tenant-aware yet).

Recommended mapping:

| Role        | Gateway scopes                                                                      |
| ----------- | ----------------------------------------------------------------------------------- |
| owner/admin | operator.admin, operator.read, operator.write, operator.approvals, operator.pairing |
| member      | operator.read, operator.write                                                       |
| readonly    | operator.read                                                                       |

## Tenant identification (ingress)

Introduce tenant resolution at both HTTP and WebSocket entry points:

- HTTP: `src/gateway/server-http.ts` should extract tenant from hostname, path prefix,
  or `X-Tenant-Id` header (priority order).
- WS: `src/gateway/server/ws-connection.ts` should capture tenant during handshake,
  then inject it into request context for method handlers.

This tenant id becomes part of the request context and drives storage path resolution,
auth checks, and usage aggregation.

## Data isolation plan

### Session store + transcripts

Current: `~/.openclaw/agents/<agentId>/sessions/*` (per-agent, not per-tenant).

Proposed:

- Add tenant partition at root:
  `~/.openclaw/tenants/<tenantId>/agents/<agentId>/sessions/*`
- Update `resolveStateDir` or session path helpers to accept `{tenantId}`.
- Consider a storage backend (S3 + index) once tenants scale.

### Workspace + memory

Current: per-agent workspace under `~/.openclaw/workspace[-<agentId>]`.

Proposed:

- Per-tenant workspace root:
  `~/.openclaw/tenants/<tenantId>/workspace[-<agentId>]`
- Agent resolution should take `tenantId` as an input (new helper similar to
  `resolveAgentWorkspaceDir`).

### Credentials + channel secrets

Current: `~/.openclaw/credentials/` (global).

Proposed:

- Tenant-scoped credentials store, e.g.
  `~/.openclaw/tenants/<tenantId>/credentials/`.
- Channel configs (Slack/Telegram) stored per tenant to avoid cross-tenant leakage.

## OAuth login + session management

Target: third-party OAuth via mcpmarket (GitHub/Gmail/WeChat). Suggested flow:

1. User hits Control UI (web) and triggers OAuth login (redirect to mcpmarket).
2. OAuth callback exchanges code for user identity and provider-linked identity.
3. Map identity to tenant membership + role (support cross-provider identity linking).
4. Issue gateway session token (tenant-bound) for WS and HTTP.

This requires:

- An auth adapter to consume mcpmarket identity tokens and mint tenant-bound gateway tokens.
- Storage for user/tenant membership (DB).
- UI changes to support login, tenant switch, and admin functions.

### Identity linking expectations

mcpmarket already supports GitHub/Gmail/WeChat login and should provide a canonical user id
or a linked-identity table. The gateway should store:

- userId (canonical)
- linkedProviders: github/google/wechat
- externalIds for each provider (for re-auth and account recovery)

## Billing + usage accounting

Existing usage summaries parse JSONL transcripts and estimate costs per model.
This is per gateway/agent, not per tenant.

Recommended usage dimensions:

- tenantId, agentId, sessionKey, provider, model, tool usage, message count.

Implementation direction:

- Add tenant to usage logs (or a parallel usage event stream).
- Store daily rollups per tenant in DB (for billing, quotas, alerts).
- Apply soft limits first (rate limits + warnings), then hard limits.

## Admin/ops UI requirements (first phase)

Minimum admin capabilities:

- Tenant list + status
- User list + role management
- Usage dashboard (daily cost/token)
- Channel connection status per tenant

## UI simplification (user-facing)

Focus on essential user flows:

- Login + tenant switch
- Chat + session list
- Basic settings (profile, API keys, channel status)
- Billing view (plan + usage summary)

Keep advanced ops (agent config, automation, debug panels) behind admin role.

## Scaling considerations (single server now, growth later)

Short term (single server):

- File-based session storage + JSONL transcripts remain OK for small tenants.
- Rate limits + soft quotas protect capacity.

Scale-out path:

- Move session store and usage rollups to DB (Postgres) and object storage for transcripts.
- Stateless gateway instances behind a load balancer, with shared auth/session storage.
- Centralized queue for long-running tasks (tool execution, media processing).

## Risks and mitigations

- Data isolation: single gateway means tenant boundaries rely on software checks.
  Mitigate with strict context injection + centralized authz middleware.
- Storage growth: JSONL scanning does not scale for billing. Plan DB-backed usage.
- Channel secrets: require strict per-tenant secret storage and auditing.

## Milestone outline (no code changes yet)

1. Architecture spec: tenant model, auth flow, data layout, usage model.
2. PoC: OAuth login + tenant-bound token + tenant-scoped workspace + sessions.
3. Billing: usage events + rollups + soft quota.
4. Admin UI: tenant/user/usage management.

## Related docs

- [Session Management](/concepts/session)
- [Agent Workspace](/concepts/agent-workspace)
- [Channel Routing](/concepts/channel-routing)
