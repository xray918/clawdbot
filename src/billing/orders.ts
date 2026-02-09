import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir, resolveTenantStateDir } from "../config/paths.js";

export type BillingOrderStatus = "pending" | "completed" | "failed" | "expired";

export type BillingOrder = {
  orderNo: string;
  tenantId: string;
  packageId: string;
  packageName: string;
  tokens: number;
  amountCny: number;
  status: BillingOrderStatus;
  paymentMethod: "wechat";
  createdAt: string;
  updatedAt: string;
  codeUrl?: string;
  transactionId?: string;
};

type OrdersFile = {
  version: 1;
  orders: Record<string, BillingOrder>;
};

type OrdersIndexFile = {
  version: 1;
  index: Record<string, string>;
};

const ORDERS_VERSION = 1;

function resolveOrdersPath(tenantId: string): string {
  const root = resolveTenantStateDir(tenantId);
  return path.join(root, "billing", "orders.json");
}

function resolveOrdersIndexPath(): string {
  const root = resolveStateDir();
  return path.join(root, "billing", "orders-index.json");
}

async function loadOrdersFile(tenantId: string): Promise<OrdersFile> {
  const filePath = resolveOrdersPath(tenantId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as OrdersFile;
    if (parsed?.version === ORDERS_VERSION && parsed.orders) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { version: ORDERS_VERSION, orders: {} };
}

async function saveOrdersFile(tenantId: string, file: OrdersFile): Promise<void> {
  const filePath = resolveOrdersPath(tenantId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

async function loadOrdersIndex(): Promise<OrdersIndexFile> {
  const filePath = resolveOrdersIndexPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as OrdersIndexFile;
    if (parsed?.version === ORDERS_VERSION && parsed.index) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { version: ORDERS_VERSION, index: {} };
}

async function saveOrdersIndex(file: OrdersIndexFile): Promise<void> {
  const filePath = resolveOrdersIndexPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

export async function createBillingOrder(order: BillingOrder): Promise<void> {
  const file = await loadOrdersFile(order.tenantId);
  file.orders[order.orderNo] = order;
  await saveOrdersFile(order.tenantId, file);
  const index = await loadOrdersIndex();
  index.index[order.orderNo] = order.tenantId;
  await saveOrdersIndex(index);
}

export async function updateBillingOrder(
  tenantId: string,
  orderNo: string,
  patch: Partial<BillingOrder>,
): Promise<BillingOrder | null> {
  const file = await loadOrdersFile(tenantId);
  const existing = file.orders[orderNo];
  if (!existing) {
    return null;
  }
  const next: BillingOrder = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  file.orders[orderNo] = next;
  await saveOrdersFile(tenantId, file);
  return next;
}

export async function getBillingOrder(
  tenantId: string,
  orderNo: string,
): Promise<BillingOrder | null> {
  const file = await loadOrdersFile(tenantId);
  return file.orders[orderNo] ?? null;
}

export async function resolveOrderTenant(orderNo: string): Promise<string | null> {
  const index = await loadOrdersIndex();
  return index.index[orderNo] ?? null;
}

export async function listBillingOrders(tenantId: string, limit = 50): Promise<BillingOrder[]> {
  const file = await loadOrdersFile(tenantId);
  const items = Object.values(file.orders);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, Math.max(1, Math.min(limit, 200)));
}
