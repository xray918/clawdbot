# OpenClaw 多租户 OAuth 登录实现笔记

## 概述

本项目支持使用 mcpmarket.cn 作为 OAuth 认证服务器实现多租户登录。

## 关键配置

### Gateway 认证配置 (`~/.openclaw/openclaw.json`)

```json
{
  "gateway": {
    "auth": {
      "mode": "mcpmarket",
      "mcpmarketBaseUrl": "https://mcpmarket.cn"
    },
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true,
      "allowInsecureAuth": true
    }
  }
}
```

### 认证模式

- `token`: 本地 token 验证（默认）
- `password`: 密码验证
- `mcpmarket`: OAuth 委托给 mcpmarket.cn 验证

## OAuth 流程

```
用户点击登录
    ↓
前端重定向到 /oauth/login
    ↓
Gateway 生成 PKCE (code_verifier + code_challenge) 和 state
    ↓
重定向到 mcpmarket.cn/oauth/authorize
    ↓
用户在 mcpmarket 登录（GitHub/Google/微信）
    ↓
mcpmarket 回调到 /oauth/callback?code=xxx&state=xxx
    ↓
Gateway 用 code + code_verifier 换取 access_token
    ↓
重定向到前端 /#access_token=xxx
    ↓
前端保存 token 到 localStorage，连接 WebSocket
    ↓
WebSocket 连接时，Gateway 调用 mcpmarket API 验证 token
```

## 关键文件

### 后端

- `src/gateway/oauth-http.ts` - OAuth HTTP 处理（/oauth/login, /oauth/callback）
- `src/gateway/auth.ts` - 认证逻辑，包含 `verifyMcpmarketToken` 和 `authorizeGatewayConnect`
- `src/gateway/server-http.ts` - HTTP 路由，引入 OAuth handler
- `src/gateway/server-runtime-config.ts` - 运行时配置解析
- `src/config/types.gateway.ts` - Gateway 类型定义，包含 `GatewayAuthMode`
- `src/config/zod-schema.ts` - 配置验证 schema

### 前端

- `ui/src/ui/views/login.ts` - 登录页面组件
- `ui/src/ui/app.ts` - 应用主组件，包含登录状态管理
- `ui/src/ui/app-render.ts` - 渲染逻辑，根据 needsLogin 显示登录页
- `ui/src/ui/app-gateway.ts` - WebSocket 连接，处理认证失败
- `ui/src/ui/app-lifecycle.ts` - 生命周期，处理 OAuth 回调

## mcpmarket Token 验证

Gateway 通过调用 mcpmarket API 验证 token：

```
GET https://mcpmarket.cn/oauth/api/verify_token?token=xxx
```

返回：

```json
{ "user_id": "xxx" }
```

## 开发命令

```bash
# 前端开发（热更新，端口 5173）
pnpm ui:dev

# 后端开发（端口 18789）
pnpm gateway:dev

# 构建前端
pnpm ui:build

# 正式启动 Gateway
pnpm openclaw gateway run --bind loopback --port 18789 --force
```

## 常见问题

### 登录后仍显示登录页

1. 检查 Gateway 日志确认 auth mode 是否为 `mcpmarket`
2. 清除浏览器 localStorage: `localStorage.clear()`
3. 确保 Gateway 已重新构建（包含最新代码）

### token_mismatch 错误

- Gateway 使用 `token` 模式但前端发送 mcpmarket token
- 确认配置文件中 `gateway.auth.mode` 为 `"mcpmarket"`
- 重启 Gateway 使配置生效

## 参考

- 参考实现: `/Users/xiexinfa/demo/clawdbot/mini-clawdbot`
  - `backend/api/v1/auth.py` - OAuth 回调处理
  - `backend/services/auth_service.py` - Token 验证
  - `frontend-next/contexts/auth-context.tsx` - 前端认证状态
