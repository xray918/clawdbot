import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

type WechatConfig = {
  appId: string;
  mchId: string;
  serialNo: string;
  apiV3Key: string;
  privateKeyPath: string;
  notifyUrl: string;
};

type WechatOrderResult = {
  codeUrl: string;
  prepayId?: string;
};

type WechatNotify = {
  outTradeNo: string;
  transactionId?: string;
  tradeState: string;
};

const WECHAT_API_BASE = "https://api.mch.weixin.qq.com";
const PLATFORM_CERT_CACHE = "wechat-platform-certs.json";

function resolveWechatConfig(): WechatConfig {
  const notifyEnv = process.env.WECHAT_NOTIFY_URL?.trim();
  const publicBase = process.env.OPENCLAW_PUBLIC_BASE_URL?.trim();
  const notifyUrl = notifyEnv || (publicBase ? `${publicBase}/api/billing/wechat/notify` : "");
  return {
    appId: process.env.WECHAT_APP_ID?.trim() ?? "",
    mchId: process.env.WECHAT_MCH_ID?.trim() ?? "",
    serialNo: process.env.WECHAT_SERIAL_NO?.trim() ?? "",
    apiV3Key: process.env.WECHAT_API_V3_KEY?.trim() ?? "",
    privateKeyPath: process.env.WECHAT_PRIVATE_KEY_PATH?.trim() ?? "",
    notifyUrl,
  };
}

function requireWechatConfig(cfg: WechatConfig) {
  if (!cfg.appId || !cfg.mchId || !cfg.serialNo || !cfg.apiV3Key || !cfg.privateKeyPath) {
    throw new Error("wechat config missing");
  }
  if (!fs.existsSync(cfg.privateKeyPath)) {
    throw new Error("wechat private key missing");
  }
}

function loadPrivateKey(pathname: string): string {
  return fs.readFileSync(pathname, "utf-8");
}

function signMessage(privateKey: string, message: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  sign.end();
  return sign.sign(privateKey, "base64");
}

function buildAuthorization(
  cfg: WechatConfig,
  method: string,
  pathUrl: string,
  body: string,
): { header: string; timestamp: string; nonce: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${pathUrl}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signMessage(loadPrivateKey(cfg.privateKeyPath), message);
  const header =
    `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",` +
    `nonce_str="${nonce}",timestamp="${timestamp}",` +
    `serial_no="${cfg.serialNo}",signature="${signature}"`;
  return { header, timestamp, nonce };
}

function decryptResource(
  cfg: WechatConfig,
  resource: { ciphertext: string; nonce: string; associated_data?: string },
) {
  const key = Buffer.from(cfg.apiV3Key, "utf-8");
  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, resource.nonce);
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf-8"));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf-8");
}

type PlatformCert = {
  serialNo: string;
  effectiveTime: string;
  expireTime: string;
  publicKey: string;
};

function resolvePlatformCertCache(): string {
  const root = resolveStateDir();
  return path.join(root, "billing", PLATFORM_CERT_CACHE);
}

function loadPlatformCertCache(): PlatformCert[] {
  const filePath = resolvePlatformCertCache();
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PlatformCert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePlatformCertCache(certs: PlatformCert[]) {
  const filePath = resolvePlatformCertCache();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(certs, null, 2), "utf-8");
}

async function fetchPlatformCerts(cfg: WechatConfig): Promise<PlatformCert[]> {
  const pathUrl = "/v3/certificates";
  const { header } = buildAuthorization(cfg, "GET", pathUrl, "");
  const res = await fetch(`${WECHAT_API_BASE}${pathUrl}`, {
    method: "GET",
    headers: {
      Authorization: header,
      Accept: "application/json",
      "User-Agent": "openclaw",
    },
  });
  if (!res.ok) {
    throw new Error(`wechat certs failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: Array<{
      serial_no: string;
      effective_time: string;
      expire_time: string;
      encrypt_certificate: { associated_data?: string; nonce: string; ciphertext: string };
    }>;
  };
  const certs: PlatformCert[] = [];
  for (const item of json.data ?? []) {
    const decrypted = decryptResource(cfg, {
      nonce: item.encrypt_certificate.nonce,
      associated_data: item.encrypt_certificate.associated_data,
      ciphertext: item.encrypt_certificate.ciphertext,
    });
    certs.push({
      serialNo: item.serial_no,
      effectiveTime: item.effective_time,
      expireTime: item.expire_time,
      publicKey: decrypted,
    });
  }
  savePlatformCertCache(certs);
  return certs;
}

async function getPlatformCert(serialNo: string, cfg: WechatConfig): Promise<PlatformCert | null> {
  const cached = loadPlatformCertCache();
  const match = cached.find((entry) => entry.serialNo === serialNo);
  if (match) {
    return match;
  }
  const refreshed = await fetchPlatformCerts(cfg);
  return refreshed.find((entry) => entry.serialNo === serialNo) ?? null;
}

export async function createWechatOrder(params: {
  orderNo: string;
  packageName: string;
  amountCny: number;
}): Promise<WechatOrderResult> {
  const cfg = resolveWechatConfig();
  requireWechatConfig(cfg);
  if (!cfg.notifyUrl) {
    throw new Error("wechat notify url missing");
  }
  const pathUrl = "/v3/pay/transactions/native";
  const body = JSON.stringify({
    appid: cfg.appId,
    mchid: cfg.mchId,
    description: params.packageName,
    out_trade_no: params.orderNo,
    notify_url: cfg.notifyUrl,
    amount: {
      total: Math.round(params.amountCny * 100),
      currency: "CNY",
    },
  });
  const { header } = buildAuthorization(cfg, "POST", pathUrl, body);
  const res = await fetch(`${WECHAT_API_BASE}${pathUrl}`, {
    method: "POST",
    headers: {
      Authorization: header,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "openclaw",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`wechat create order failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { code_url?: string; prepay_id?: string };
  if (!data.code_url) {
    throw new Error("wechat response missing code_url");
  }
  return { codeUrl: data.code_url, prepayId: data.prepay_id };
}

export async function queryWechatOrder(orderNo: string): Promise<WechatNotify | null> {
  const cfg = resolveWechatConfig();
  requireWechatConfig(cfg);
  const pathUrl = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${cfg.mchId}`;
  const { header } = buildAuthorization(cfg, "GET", pathUrl, "");
  const res = await fetch(`${WECHAT_API_BASE}${pathUrl}`, {
    method: "GET",
    headers: {
      Authorization: header,
      Accept: "application/json",
      "User-Agent": "openclaw",
    },
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as {
    trade_state?: string;
    transaction_id?: string;
    out_trade_no?: string;
  };
  if (!data.out_trade_no) {
    return null;
  }
  return {
    outTradeNo: data.out_trade_no,
    transactionId: data.transaction_id,
    tradeState: data.trade_state ?? "",
  };
}

export async function verifyAndParseWechatNotify(params: {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}): Promise<WechatNotify | null> {
  const cfg = resolveWechatConfig();
  requireWechatConfig(cfg);
  const signature = String(params.headers["wechatpay-signature"] ?? "");
  const timestamp = String(params.headers["wechatpay-timestamp"] ?? "");
  const nonce = String(params.headers["wechatpay-nonce"] ?? "");
  const serial = String(params.headers["wechatpay-serial"] ?? "");
  if (!signature || !timestamp || !nonce || !serial) {
    return null;
  }
  const cert = await getPlatformCert(serial, cfg);
  if (!cert) {
    return null;
  }
  const message = `${timestamp}\n${nonce}\n${params.body}\n`;
  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(message, "utf-8"),
    cert.publicKey,
    Buffer.from(signature, "base64"),
  );
  if (!verified) {
    return null;
  }
  const parsed = JSON.parse(params.body) as {
    resource?: { ciphertext: string; nonce: string; associated_data?: string };
  };
  if (!parsed?.resource) {
    return null;
  }
  const decrypted = decryptResource(cfg, parsed.resource);
  const result = JSON.parse(decrypted) as {
    out_trade_no?: string;
    transaction_id?: string;
    trade_state?: string;
  };
  if (!result.out_trade_no || !result.trade_state) {
    return null;
  }
  return {
    outTradeNo: result.out_trade_no,
    transactionId: result.transaction_id,
    tradeState: result.trade_state,
  };
}
