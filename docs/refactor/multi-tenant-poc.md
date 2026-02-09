---
summary: "多租户 PoC 设计（单网关，多用户 OAuth，最小可用）"
title: "多租户 PoC 设计"
---

## 多租户 PoC 设计（单网关，多用户 OAuth）

本文是下一步 PoC 设计文档，基于现有 OpenClaw 架构，结合 mcpmarket 作为 OAuth 认证源。
目标是实现**最小可用**的多租户能力，并为后续扩容做好路径预留。

## 目标与范围

**必须达成：**

- 通过 mcpmarket 完成 OAuth 登录（GitHub/Gmail/微信）。
- 用户登录后可进入自己的租户空间。
- 每个租户拥有独立的 workspace、session、凭据与通道配置。
- 简化 UI：只保留登录、聊天、会话列表、基础设置、账单视图、定时任务管理。
- 管理员后台：复用现有前端进行改造，可查看整体用户与租户概览。

**暂不做：**

- 全量计费闭环（本阶段将实现）。
- 多地域部署与跨区容灾。
- 高级运维工具（先保留管理员最小面板）。

## 核心设计原则

- **租户优先**：所有数据与权限以 tenantId 为第一维度。
- **最小入侵**：复用现有 Agent 与 Session 逻辑，只增加 tenant 层。
- **安全兜底**：所有 Gateway 方法按 tenant 过滤与权限检查。

## 逻辑模型（最小）

**实体：**

- Tenant：租户（计费与隔离域）
- User：用户（OAuth 身份）
- TenantUser：用户与租户关系（角色）
- Agent：现有 agent 概念（租户内的 agent）

**角色与权限映射：**

- owner/admin → operator.admin + operator.read/write + approvals/pairing
- member → operator.read/write
- readonly → operator.read

## OAuth 登录与用户对齐（mcpmarket）

### 登录流程

1. 用户访问前端，点击登录。
2. 前端跳转至 mcpmarket OAuth（生产域名：[https://mcpmarket.cn](https://mcpmarket.cn)）。
3. mcpmarket 回调携带 code。
4. 服务端用 code 换 token，并拉取 mcpmarket 用户信息。
5. 从 mcpmarket 返回的 canonical userId 与 linked identities 创建/绑定用户。
6. 生成 tenant-bound 的 gateway token（或 session token）。
7. 前端保存 token，建立 WS 连接并携带 tenant 信息。

### 需要的用户字段（最小）

- userId（mcpmarket canonical）
- providers：github/google/wechat
- providerIds：每个平台的外部 id
- email（如可获得）

### 实现参考

- mcpmarket 本地工程：`/Users/xiexinfa/mcpmarket-quart`
- OAuth 接口以生产环境域名为准：`https://mcpmarket.cn`

## 多租户隔离方案（PoC 级）

### 目录隔离（文件存储）

```text
~/.openclaw/tenants/<tenantId>/
  agents/<agentId>/sessions/
  workspaces/<agentId>/
  credentials/
  config/openclaw.json
```

### 代码入口改造点

- `src/gateway/server-http.ts`
  - HTTP 请求提取 tenantId（header / host / path）。
- `src/gateway/server/ws-connection.ts`
  - WS 握手阶段提取 tenantId。
- `src/gateway/server-methods.ts`
  - 所有方法调用时加入 tenantId 校验。
- `src/agents/agent-scope.ts`
  - workspace/agentDir 解析加入 tenant 维度。
- `src/config/sessions/paths.ts`
  - sessions 路径加入 tenant 维度。

## 数据与权限校验路径

**所有请求必须经过：**

1. tenantId 解析（HTTP/WS）
2. OAuth token 校验（mcpmarket）
3. tenantUser 角色校验
4. Agent/Session 访问范围校验

## 简化前端（PoC 版本）

**保留页面：**

- 登录页
- Chat + session 列表
- 设置（个人信息、通道状态）
- 通道配置仅保留飞书（App ID + App Secret）
- 账单（usage summary + plan）
- 定时任务（查看、删除、暂停/恢复）

**隐藏：**

- 高级配置、自动化、调试面板
- 多 agent 配置页面（先固定默认 agent）

## 计费与使用统计（PoC，全量闭环）

**计费规则：**

- 计价参考：`google gemini-3-flash-preview`
- 每日免费 token 配额（每租户/每用户需确认口径）
- 不足可购买 token 包（预付费）
- 超额处理：提醒 + 限流/阻断（可配置）

**实现要点：**

- 统计维度：tenantId + agentId + sessionKey + provider + model
- usage 事件写入 DB（建议独立 usage 表）
- 定期 rollup（按天/按月）
- 账单逻辑与 token 包扣减

## 单机到扩容的路线

**单机阶段：**

- 文件存储（tenant 目录隔离）
- 内置 token 与 mcpmarket OAuth

**扩容阶段：**

- Postgres 替代文件存储
- Redis 做 session/token 缓存
- 对象存储保存 session transcript
- 无状态 gateway + 负载均衡

## PoC 交付物清单

- OAuth 接入适配器（mcpmarket）
- tenantId 解析与上下文注入
- tenant 级目录结构与配置加载
- 简化前端入口
- 全量计费闭环（免费额度 + token 包 + usage 账单）
- 定时任务管理界面
- 管理员总览界面（用户/租户/使用情况）

## 验收标准

- 不同租户之间 session/workspace/凭据完全隔离
- 登录后可正常聊天，session 列表只展示租户内数据
- OAuth 登录可跨平台用户对齐
- 计费可按租户查看并扣减 token 包
