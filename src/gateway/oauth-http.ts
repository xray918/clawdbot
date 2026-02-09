/**
 * Phone Auth HTTP Handler - phone number based multi-user login.
 *
 * Provides a simple POST /auth/phone-login endpoint.
 * No SMS verification — phone number is trusted as-is for now.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPhoneToken } from "./auth.js";

/** Validate Chinese mobile phone format (1xx-xxxx-xxxx, 11 digits). */
function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getPathname(url: string): string {
  const questionMark = url.indexOf("?");
  if (questionMark === -1) {
    return url;
  }
  return url.slice(0, questionMark);
}

/** Read request body as string (max 4KB). */
function readBody(req: IncomingMessage, maxBytes = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export async function handleOAuthHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const urlRaw = req.url ?? "/";
  const pathname = getPathname(urlRaw);

  // POST /auth/phone-login — issue a phone auth token
  if (pathname === "/auth/phone-login" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as { phone?: string };
      const phone = (parsed.phone ?? "").trim();

      if (!phone) {
        sendJson(res, 400, { error: "phone_required", message: "手机号不能为空" });
        return true;
      }

      if (!isValidPhone(phone)) {
        sendJson(res, 400, { error: "phone_invalid", message: "手机号格式不正确" });
        return true;
      }

      // No SMS verification — issue token directly
      const token = createPhoneToken(phone);
      console.log(`[phone-auth] Login: phone=${phone.slice(0, 3)}****${phone.slice(-4)}`);

      sendJson(res, 200, { token, phone });
      return true;
    } catch (err) {
      const message =
        err instanceof Error && err.message === "body_too_large" ? "请求体过大" : "请求解析失败";
      sendJson(res, 400, { error: "bad_request", message });
      return true;
    }
  }

  // Legacy OAuth routes — no longer used, return 410 Gone
  if ((pathname === "/oauth/login" || pathname === "/oauth/callback") && req.method === "GET") {
    sendJson(res, 410, {
      error: "gone",
      message: "OAuth login is no longer supported. Use phone login.",
    });
    return true;
  }

  return false;
}
