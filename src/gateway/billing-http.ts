import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveOrderTenant, updateBillingOrder, getBillingOrder } from "../billing/orders.js";
import { creditTenantTokens } from "../billing/store.js";
import { verifyAndParseWechatNotify } from "../billing/wechat.js";
import { createConfigIO } from "../config/config.js";
import { resolveTenantConfigPath } from "../config/paths.js";
import { sendJson, sendMethodNotAllowed } from "./http-common.js";

export async function handleBillingWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/billing/wechat/notify") {
    return false;
  }
  if (req.method !== "POST") {
    sendMethodNotAllowed(res);
    return true;
  }
  const maxBytes = 128 * 1024;
  let raw: string;
  try {
    raw = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new Error("payload too large"));
          return;
        }
        chunks.push(buf);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "payload too large";
    sendJson(res, 413, { ok: false, error: message });
    return true;
  }
  let notify: Awaited<ReturnType<typeof verifyAndParseWechatNotify>> | null = null;
  try {
    notify = await verifyAndParseWechatNotify({ headers: req.headers, body: raw });
  } catch (err) {
    sendJson(res, 500, { code: "FAIL", message: String(err) });
    return true;
  }
  if (!notify) {
    sendJson(res, 400, { code: "FAIL", message: "invalid notify" });
    return true;
  }
  const orderNo = notify.outTradeNo;
  const tenantId = await resolveOrderTenant(orderNo);
  if (!tenantId) {
    sendJson(res, 404, { code: "FAIL", message: "order not found" });
    return true;
  }
  const order = await getBillingOrder(tenantId, orderNo);
  if (!order) {
    sendJson(res, 404, { code: "FAIL", message: "order not found" });
    return true;
  }
  if (notify.tradeState === "SUCCESS" && order.status !== "completed") {
    await updateBillingOrder(tenantId, orderNo, {
      status: "completed",
      transactionId: notify.transactionId,
    });
    const configIo = createConfigIO({ configPath: resolveTenantConfigPath(tenantId) });
    const cfg = configIo.loadConfig();
    await creditTenantTokens({
      tenantId,
      tokens: order.tokens,
      cfg,
      orderId: order.orderNo,
      packageId: order.packageId,
      packageName: order.packageName,
      priceCny: order.amountCny,
    });
  }
  sendJson(res, 200, { code: "SUCCESS", message: "OK" });
  return true;
}
