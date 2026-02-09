import qrcode from "qrcode";
import type { GatewayRequestHandlers } from "./types.js";
import {
  createBillingOrder,
  getBillingOrder,
  listBillingOrders,
  updateBillingOrder,
} from "../../billing/orders.js";
import { creditTenantTokens, getTenantBillingStatus } from "../../billing/store.js";
import { createWechatOrder, queryWechatOrder } from "../../billing/wechat.js";
import { createConfigIO } from "../../config/config.js";
import { resolveTenantConfigPath } from "../../config/paths.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateBillingOrderCreateParams,
  validateBillingOrderStatusParams,
  validateBillingOrdersListParams,
  validateBillingPackagesParams,
  validateBillingPurchaseParams,
  validateBillingStatusParams,
} from "../protocol/index.js";

function resolveConfigForTenant(tenantId?: string) {
  if (tenantId) {
    return createConfigIO({ configPath: resolveTenantConfigPath(tenantId) });
  }
  return createConfigIO();
}

export const billingHandlers: GatewayRequestHandlers = {
  "billing.status": async ({ params, respond, context }) => {
    if (!validateBillingStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.status params: ${formatValidationErrors(
            validateBillingStatusParams.errors,
          )}`,
        ),
      );
      return;
    }
    const configIo = resolveConfigForTenant(context.tenantId);
    const cfg = configIo.loadConfig();
    const status = await getTenantBillingStatus({ tenantId: context.tenantId, cfg });
    if (!status.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "billing status unavailable", {
          details: { reason: status.reason },
        }),
      );
      return;
    }
    respond(true, status.status, undefined);
  },
  "billing.packages": ({ params, respond, context }) => {
    if (!validateBillingPackagesParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.packages params: ${formatValidationErrors(
            validateBillingPackagesParams.errors,
          )}`,
        ),
      );
      return;
    }
    const configIo = resolveConfigForTenant(context.tenantId);
    const cfg = configIo.loadConfig();
    const packages = Array.isArray(cfg.billing?.packages) ? (cfg.billing?.packages ?? []) : [];
    respond(true, { packages }, undefined);
  },
  "billing.purchase": async ({ params, respond, context }) => {
    if (!validateBillingPurchaseParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.purchase params: ${formatValidationErrors(
            validateBillingPurchaseParams.errors,
          )}`,
        ),
      );
      return;
    }
    const p = params as {
      packageId?: string;
      tokens?: number;
      orderId?: string;
      priceCny?: number;
    };
    const configIo = resolveConfigForTenant(context.tenantId);
    const cfg = configIo.loadConfig();
    const packages = Array.isArray(cfg.billing?.packages) ? (cfg.billing?.packages ?? []) : [];
    const packageId = p.packageId?.trim();
    let tokens = typeof p.tokens === "number" ? Math.floor(p.tokens) : 0;
    let packageName: string | undefined;
    let priceCny: number | undefined;
    if (packageId) {
      const match = packages.find((entry) => entry.id === packageId);
      if (!match) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown packageId"));
        return;
      }
      tokens = match.tokens;
      packageName = match.name;
      priceCny = match.priceCny;
    }
    if (tokens <= 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tokens required"));
      return;
    }
    const credit = await creditTenantTokens({
      tenantId: context.tenantId,
      tokens,
      cfg,
      orderId: p.orderId,
      packageId: packageId ?? undefined,
      packageName,
      priceCny: typeof p.priceCny === "number" ? p.priceCny : priceCny,
    });
    if (!credit.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "billing credit failed", {
          details: { reason: credit.reason },
        }),
      );
      return;
    }
    respond(true, { ok: true, tokens, state: credit.state }, undefined);
  },
  "billing.order.create": async ({ params, respond, context }) => {
    if (!validateBillingOrderCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.order.create params: ${formatValidationErrors(
            validateBillingOrderCreateParams.errors,
          )}`,
        ),
      );
      return;
    }
    const p = params as { packageId: string };
    const tenantId = (context.tenantId ?? "").trim().toLowerCase();
    if (!tenantId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tenantId required"));
      return;
    }
    const configIo = resolveConfigForTenant(tenantId);
    const cfg = configIo.loadConfig();
    const packages = Array.isArray(cfg.billing?.packages) ? (cfg.billing?.packages ?? []) : [];
    const match = packages.find((entry) => entry.id === p.packageId);
    if (!match) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown packageId"));
      return;
    }
    if (!match.priceCny || match.priceCny <= 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "package price missing"));
      return;
    }
    const now = new Date();
    const orderNo = `ORD${now
      .toISOString()
      .replaceAll(/[-:TZ.]/g, "")
      .slice(0, 14)}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    let result;
    try {
      result = await createWechatOrder({
        orderNo,
        packageName: match.name,
        amountCny: match.priceCny,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `wechat order failed: ${String(err)}`),
      );
      return;
    }
    await createBillingOrder({
      orderNo,
      tenantId,
      packageId: match.id,
      packageName: match.name,
      tokens: match.tokens,
      amountCny: match.priceCny ?? 0,
      status: "pending",
      paymentMethod: "wechat",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      codeUrl: result.codeUrl,
    });
    const qrDataUrl = await qrcode.toDataURL(result.codeUrl, { margin: 1, width: 220 });
    respond(true, { orderNo, codeUrl: result.codeUrl, qrDataUrl }, undefined);
  },
  "billing.order.status": async ({ params, respond, context }) => {
    if (!validateBillingOrderStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.order.status params: ${formatValidationErrors(
            validateBillingOrderStatusParams.errors,
          )}`,
        ),
      );
      return;
    }
    const p = params as { orderNo: string };
    const tenantId = (context.tenantId ?? "").trim().toLowerCase();
    if (!tenantId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tenantId required"));
      return;
    }
    const order = await getBillingOrder(tenantId, p.orderNo);
    if (!order) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "order not found"));
      return;
    }
    if (order.status === "pending") {
      const queried = await queryWechatOrder(order.orderNo);
      if (queried?.tradeState === "SUCCESS") {
        const updated = await updateBillingOrder(order.tenantId, order.orderNo, {
          status: "completed",
          transactionId: queried.transactionId,
        });
        if (updated) {
          const configIo = resolveConfigForTenant(tenantId);
          const cfg = configIo.loadConfig();
          await creditTenantTokens({
            tenantId: order.tenantId,
            tokens: order.tokens,
            cfg,
            orderId: order.orderNo,
            packageId: order.packageId,
            packageName: order.packageName,
            priceCny: order.amountCny,
          });
        }
      }
    }
    const latest = await getBillingOrder(order.tenantId, order.orderNo);
    respond(true, { order: latest }, undefined);
  },
  "billing.orders.list": async ({ params, respond, context }) => {
    if (!validateBillingOrdersListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid billing.orders.list params: ${formatValidationErrors(
            validateBillingOrdersListParams.errors,
          )}`,
        ),
      );
      return;
    }
    const p = params as { limit?: number };
    const limit =
      typeof p.limit === "number" && Number.isFinite(p.limit) ? Math.max(1, p.limit) : 50;
    const tenantId = (context.tenantId ?? "").trim().toLowerCase();
    if (!tenantId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tenantId required"));
      return;
    }
    const orders = await listBillingOrders(tenantId, limit);
    respond(true, { orders }, undefined);
  },
};
