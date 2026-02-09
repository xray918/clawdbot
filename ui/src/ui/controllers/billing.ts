import type { GatewayBrowserClient } from "../gateway.ts";
import type { BillingOrder, BillingPackage, BillingStatus } from "../types.ts";

export type BillingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  billingLoading: boolean;
  billingPackages: BillingPackage[];
  billingStatus: BillingStatus | null;
  billingOrders: BillingOrder[];
  billingError: string | null;
  billingPurchaseBusy: boolean;
  billingOrderNo: string | null;
  billingQrDataUrl: string | null;
};

export async function loadBilling(state: BillingState) {
  if (!state.client || !state.connected || state.billingLoading) {
    return;
  }
  state.billingLoading = true;
  state.billingError = null;
  try {
    const [status, packages, orders] = await Promise.all([
      state.client.request<BillingStatus>("billing.status", {}),
      state.client.request<{ packages: BillingPackage[] }>("billing.packages", {}),
      state.client.request<{ orders: BillingOrder[] }>("billing.orders.list", { limit: 20 }),
    ]);
    state.billingStatus = status ?? null;
    state.billingPackages = Array.isArray(packages?.packages) ? packages.packages : [];
    state.billingOrders = Array.isArray(orders?.orders) ? orders.orders : [];
  } catch (err) {
    state.billingError = String(err);
  } finally {
    state.billingLoading = false;
  }
}

export async function purchaseBillingPackage(
  state: BillingState,
  params: { packageId: string; orderId?: string },
) {
  if (!state.client || !state.connected || state.billingPurchaseBusy) {
    return;
  }
  state.billingPurchaseBusy = true;
  state.billingError = null;
  try {
    await state.client.request("billing.purchase", {
      packageId: params.packageId,
      orderId: params.orderId,
    });
    await loadBilling(state);
  } catch (err) {
    state.billingError = String(err);
  } finally {
    state.billingPurchaseBusy = false;
  }
}

export async function purchaseBillingTokens(
  state: BillingState,
  params: { tokens: number; orderId?: string },
) {
  if (!state.client || !state.connected || state.billingPurchaseBusy) {
    return;
  }
  state.billingPurchaseBusy = true;
  state.billingError = null;
  try {
    await state.client.request("billing.purchase", {
      tokens: params.tokens,
      orderId: params.orderId,
    });
    await loadBilling(state);
  } catch (err) {
    state.billingError = String(err);
  } finally {
    state.billingPurchaseBusy = false;
  }
}

export async function createBillingOrder(state: BillingState, packageId: string) {
  if (!state.client || !state.connected || state.billingPurchaseBusy) {
    return;
  }
  state.billingPurchaseBusy = true;
  state.billingError = null;
  try {
    const res = await state.client.request<{
      orderNo: string;
      codeUrl: string;
      qrDataUrl?: string;
    }>("billing.order.create", { packageId });
    state.billingOrderNo = res.orderNo;
    state.billingQrDataUrl = res.qrDataUrl ?? null;
    await loadBilling(state);
  } catch (err) {
    state.billingError = String(err);
  } finally {
    state.billingPurchaseBusy = false;
  }
}

export async function refreshBillingOrderStatus(state: BillingState, orderNo: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("billing.order.status", { orderNo });
    await loadBilling(state);
  } catch (err) {
    state.billingError = String(err);
  }
}
