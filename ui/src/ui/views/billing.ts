import { html } from "lit";
import type { BillingOrder, BillingPackage, BillingStatus } from "../types.ts";

export type BillingProps = {
  loading: boolean;
  status: BillingStatus | null;
  packages: BillingPackage[];
  orders: BillingOrder[];
  error: string | null;
  purchaseBusy: boolean;
  orderId: string;
  customTokens: string;
  orderNo: string | null;
  qrDataUrl: string | null;
  canManualCredit: boolean;
  onOrderIdChange: (next: string) => void;
  onCustomTokensChange: (next: string) => void;
  onRefresh: () => void;
  onPurchasePackage: (packageId: string) => void;
  onPurchaseTokens: (tokens: number) => void;
  onCreateOrder: (packageId: string) => void;
  onRefreshOrder: (orderNo: string) => void;
};

function renderStatus(status: BillingStatus | null) {
  if (!status) {
    return html`
      <div class="card-sub">暂无计费信息。</div>
    `;
  }
  const freeUsed = Math.max(0, status.dailyFreeTokens - status.freeTokensRemaining);
  return html`
    <div class="kv-grid">
      <div class="kv-row">
        <div class="kv-label">计费状态</div>
        <div class="kv-value">${status.enabled ? "已启用" : "未启用"}</div>
      </div>
      <div class="kv-row">
        <div class="kv-label">付费余额</div>
        <div class="kv-value">${status.state.tokenBalance} tokens</div>
      </div>
      <div class="kv-row">
        <div class="kv-label">免费额度</div>
        <div class="kv-value">
          ${status.freeTokensRemaining} / ${status.dailyFreeTokens} tokens
        </div>
      </div>
      <div class="kv-row">
        <div class="kv-label">今日免费已用</div>
        <div class="kv-value">${freeUsed} tokens</div>
      </div>
      <div class="kv-row">
        <div class="kv-label">累计消耗</div>
        <div class="kv-value">${status.state.totalTokensConsumed} tokens</div>
      </div>
      <div class="kv-row">
        <div class="kv-label">今日免费剩余</div>
        <div class="kv-value">${status.freeTokensRemaining} tokens</div>
      </div>
    </div>
  `;
}

export function renderBilling(props: BillingProps) {
  const packages = props.packages ?? [];
  const orders = props.orders ?? [];
  const customTokens = Number.parseInt(props.customTokens, 10);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">计费概览</div>
          <div class="card-sub">查看余额、免费额度和使用情况。</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "加载中…" : "刷新"}
        </button>
      </div>
      ${props.error ? html`<div class="pill danger">${props.error}</div>` : null}
      ${renderStatus(props.status)}
    </section>

    <section class="card">
      <div class="card-title">充值套餐</div>
      <div class="card-sub">选择套餐生成微信扫码支付二维码。</div>
      ${
        packages.length === 0
          ? html`
              <div class="card-sub">暂无可用套餐。</div>
            `
          : html`
            <div class="grid grid-2">
              ${packages.map(
                (pkg) => html`
                  <div class="card">
                    <div class="card-title">${pkg.name}</div>
                    <div class="card-sub">${pkg.tokens} tokens</div>
                    <div class="row" style="justify-content: space-between; margin-top: 12px;">
                      <div class="pill">${pkg.priceCny ? `¥${pkg.priceCny}` : "价格待定"}</div>
                      <div class="row" style="gap: 8px;">
                        <button
                          class="btn"
                          ?disabled=${props.purchaseBusy}
                          @click=${() => props.onPurchasePackage(pkg.id)}
                        >
                          手动入账
                        </button>
                        <button
                          class="btn primary"
                          ?disabled=${props.purchaseBusy}
                          @click=${() => props.onCreateOrder(pkg.id)}
                        >
                          生成二维码
                        </button>
                      </div>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
      }
      ${
        props.qrDataUrl
          ? html`
              <div class="row" style="margin-top: 16px; align-items: center; gap: 16px;">
                <div class="qr-wrap">
                  <img src=${props.qrDataUrl} alt="WeChat Pay QR" />
                </div>
                <div>
                  <div class="card-sub">订单号：${props.orderNo ?? "-"}</div>
                  <button
                    class="btn"
                    ?disabled=${props.purchaseBusy || !props.orderNo}
                    @click=${() => props.orderNo && props.onRefreshOrder(props.orderNo)}
                  >
                    刷新支付状态
                  </button>
                </div>
              </div>
            `
          : null
      }
    </section>

    ${
      props.canManualCredit
        ? html`
            <section class="card">
              <div class="card-title">手动入账</div>
              <div class="card-sub">用于对账或补单（仅管理员可见）。</div>
              <div class="row" style="gap: 12px; flex-wrap: wrap;">
                <label class="field">
                  <span class="field-label">订单号（可选）</span>
                  <input
                    type="text"
                    .value=${props.orderId}
                    @input=${(ev: Event) =>
                      props.onOrderIdChange((ev.target as HTMLInputElement).value)}
                    placeholder="order-xxxx"
                  />
                </label>
                <label class="field">
                  <span class="field-label">入账 tokens</span>
                  <input
                    type="number"
                    min="1"
                    .value=${props.customTokens}
                    @input=${(ev: Event) =>
                      props.onCustomTokensChange((ev.target as HTMLInputElement).value)}
                    placeholder="100000"
                  />
                </label>
                <button
                  class="btn primary"
                  ?disabled=${props.purchaseBusy || !Number.isFinite(customTokens) || customTokens <= 0}
                  @click=${() => props.onPurchaseTokens(customTokens)}
                >
                  立即入账
                </button>
              </div>
            </section>
          `
        : null
    }

    <section class="card">
      <div class="card-title">最近订单</div>
      ${
        orders.length === 0
          ? html`
              <div class="card-sub">暂无订单记录。</div>
            `
          : html`
            <div class="table">
              <div class="table-row table-head">
                <div>订单号</div>
                <div>套餐</div>
                <div>金额</div>
                <div>状态</div>
                <div>创建时间</div>
              </div>
              ${orders.map(
                (order) => html`
                  <div class="table-row">
                    <div>${order.orderNo}</div>
                    <div>${order.packageName}</div>
                    <div>${order.amountCny ? `¥${order.amountCny}` : "-"}</div>
                    <div>${order.status}</div>
                    <div>${order.createdAt}</div>
                  </div>
                `,
              )}
            </div>
          `
      }
    </section>
  `;
}
