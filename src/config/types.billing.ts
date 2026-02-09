export type BillingConfig = {
  /** Enable tenant billing enforcement. Default: false. */
  enabled?: boolean;
  /** Daily free tokens per tenant. */
  dailyFreeTokens?: number;
  /** Seed token balance when a tenant has no state yet. */
  initialTokenBalance?: number;
  /** Fixed output token estimate added per request. */
  estimateOutputTokens?: number;
  /** Estimated tokens per image attachment. */
  estimateImageTokens?: number;
  /** Available token packages for purchase. */
  packages?: Array<{
    id: string;
    name: string;
    tokens: number;
    priceCny?: number;
  }>;
};
