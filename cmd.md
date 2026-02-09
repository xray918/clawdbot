# OpenClaw 常用操作指令

## 📦 首次安装部署

### 1. 克隆仓库

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

### 2. 安装依赖

```bash
# 检查 Node.js 版本 (需要 >= 22.12.0)
node --version

# 检查 pnpm 版本
pnpm --version

# 安装项目依赖
pnpm install
```

### 3. 构建项目

```bash
# 构建 UI
pnpm ui:build

# 构建主项目
pnpm build
```

### 4. 首次启动网关

```bash
# 方式1: 直接启动 (端口 18789)
pnpm openclaw gateway --port 18789

# 方式2: 使用向导安装 (推荐)
pnpm openclaw onboard --install-daemon

# 方式3: 强制启动 (如果端口被占用)
pnpm openclaw gateway --port 18789 --force
```

---

## 🚀 日常启动和停止

### 启动网关 (后端服务)

```bash
# 前台启动 (可以看到日志输出)
pnpm openclaw gateway --port 18789

# 后台启动 (使用 nohup)
nohup pnpm openclaw gateway --port 18789 > /tmp/openclaw-gateway.log 2>&1 &

# 开发模式 (文件变化自动重启)
pnpm gateway:watch

# 开发模式 (跳过通道初始化)
pnpm gateway:dev
```

### 访问前端 (Web UI)

```bash
# 网关启动后，直接访问浏览器:
# http://127.0.0.1:18789/

# 如果需要 token 访问，查看启动日志获取完整 URL
# http://127.0.0.1:18789/?token=<your-token>
```

### 停止网关

```bash
# 方式1: 查找进程并停止
lsof -i :18789
kill <PID>

# 方式2: 批量停止所有 openclaw 网关进程
pkill -f "openclaw gateway"

# 方式3: 强制停止
pkill -9 -f "openclaw gateway"

# 方式4: 停止特定 PID
kill -9 <PID>
```

---

## 📋 查看日志

### 实时查看网关日志

```bash
# 方式1: 查看今天的日志文件
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 方式2: 使用 openclaw 日志命令
pnpm openclaw logs --follow

# 方式3: macOS 系统日志 (如果安装了 Mac app)
./scripts/clawlog.sh

# 方式4: 查看最近 100 行日志
tail -n 100 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 方式5: 实时监控所有日志
tail -f /tmp/openclaw/*.log
```

### 查看特定通道日志

```bash
# 查看飞书通道日志
pnpm openclaw logs --follow | grep feishu

# 查看 WebSocket 日志
pnpm openclaw logs --follow | grep ws

# 查看浏览器服务日志
pnpm openclaw logs --follow | grep browser
```

---

## 🔧 配置和管理

### 沙盒管理

```bash
# 查看沙盒配置
cat ~/.openclaw/openclaw.json | jq '.agents.defaults.sandbox'

# 查看沙盒镜像
docker images | grep openclaw-sandbox

# 查看运行中的沙盒容器
docker ps -a | grep openclaw

# 重新构建沙盒镜像
bash scripts/sandbox-setup.sh

# 清理所有沙盒容器
docker ps -a | grep openclaw | awk '{print $1}' | xargs docker rm -f

# 启用沙盒 (non-main 模式 - 推荐生产环境)
pnpm openclaw config set agents.defaults.sandbox.mode non-main
pnpm openclaw config set agents.defaults.sandbox.scope session
pnpm openclaw config set agents.defaults.sandbox.workspaceAccess none

# 启用沙盒 (all 模式 - 最高安全性)
pnpm openclaw config set agents.defaults.sandbox.mode all

# 禁用沙盒
pnpm openclaw config set agents.defaults.sandbox.mode off

# 沙盒配置说明
# mode:
#   - off: 所有会话在主机运行 (默认，适合开发)
#   - non-main: 只有群组/频道在沙箱，DM 和 CLI 在主机运行
#       ⚠️  飞书/Telegram 私聊 (DM) = main 会话，不会被沙箱化！
#       ✅  飞书/Telegram 群组 = non-main 会话，会被沙箱化
#   - all: 所有会话都在容器中运行 (推荐生产环境)
#       ✅  飞书 DM/群组、CLI、Web 全部在沙箱中
# scope:
#   - session: 每个会话独立容器 (推荐，最强隔离)
#   - agent: 每个 agent 一个容器
#   - shared: 所有会话共享一个容器
# workspaceAccess:
#   - none: 容器无法访问主机文件 (推荐生产环境)
#   - ro: 容器可只读访问工作区
#   - rw: 容器可读写访问工作区

# 使用场景建议:
# 1. 开发调试: mode=off (方便访问主机文件)
# 2. 生产环境（Bot 对外服务）: mode=all (完全隔离)
# 3. 混合场景（自己用 + 对外服务）: 使用多 agent 配置
```

### 沙箱资源监控

```bash
# 实时监控所有沙箱容器资源
docker stats $(docker ps -q --filter "name=openclaw-sbx") 2>/dev/null

# 统计运行中的沙箱数量
docker ps --filter "name=openclaw-sbx" | wc -l

# 统计所有沙箱容器（包括停止的）
docker ps -a --filter "name=openclaw-sbx" | wc -l

# 查看 Docker 整体资源占用
docker system df

# 查看沙箱工作区磁盘占用
du -sh ~/.openclaw/sandboxes/*

# 查看单个容器详情
docker inspect <container-name>

# 查看容器日志
docker logs <container-name>

# 资源占用说明（参考 sandbox-resources.md）:
# - 基础镜像: 335MB (所有容器共享，一次性)
# - 每个用户: 8-20KB (容器层) + 400KB-2MB (工作区) + 1-5MB (内存)
# - 10 用户约占: 335.5MB 磁盘 + 50MB 内存
# - 100 用户约占: 340MB 磁盘 + 500MB 内存
# - 自动清理: 空闲 24 小时后清理容器
```

### 沙箱清理策略配置

```bash
# 设置空闲清理时间（小时）
pnpm openclaw config set agents.defaults.sandbox.prune.idleHours 24

# 设置最长保留时间（天）
pnpm openclaw config set agents.defaults.sandbox.prune.maxAgeDays 7

# 更激进的清理（资源受限环境）
pnpm openclaw config set agents.defaults.sandbox.prune.idleHours 1
pnpm openclaw config set agents.defaults.sandbox.prune.maxAgeDays 1

# 查看当前清理配置
cat ~/.openclaw/openclaw.json | jq '.agents.defaults.sandbox.prune'
```

### 沙箱性能测试

```bash
# 下载性能测试脚本（如果已创建）
# 主机模式性能测试
python3 /tmp/perf_test.py "主机" "/tmp/host-perf-test"

# 沙箱模式性能测试（需要先复制脚本到容器）
CONTAINER_NAME=$(docker ps --filter "name=openclaw-sbx" --format "{{.Names}}" | head -1)
docker cp /tmp/perf_test.py $CONTAINER_NAME:/workspace/perf_test.py
docker exec $CONTAINER_NAME python3 /workspace/perf_test.py "沙箱" "/workspace/perf-test"

# 简单 I/O 性能对比
# 主机写入测试 (100MB)
time dd if=/dev/zero of=/tmp/test.dat bs=1M count=100 oflag=direct

# 沙箱写入测试 (100MB)
time docker exec $CONTAINER_NAME dd if=/dev/zero of=/workspace/test.dat bs=1M count=100 oflag=direct

# 查看文件系统驱动（影响性能）
docker info | grep "Storage Driver"

# 性能对比总结（参考 sandbox-performance.md）:
# - 文件 I/O: 沙箱比主机慢 2-6倍
# - 对话交互: 几乎无影响 (无文件操作)
# - 批量文件: 额外 0.1-0.5s 延迟
# - 构建任务: 明显变慢，建议主机模式
```

### 查看状态

```bash
# 查看所有通道状态
pnpm openclaw channels status

# 查看通道状态并探测连接
pnpm openclaw channels status --probe

# 查看插件列表
pnpm openclaw plugins list

# 查看配置信息
pnpm openclaw config list
```

### 配置管理

```bash
# 交互式配置向导
pnpm openclaw configure

# 配置特定部分
pnpm openclaw configure --section web

# 设置配置项
pnpm openclaw config set gateway.port 18789
pnpm openclaw config set agent.model "anthropic/claude-opus-4-5"

# 查看配置
pnpm openclaw config get gateway.port

# 删除配置项
pnpm openclaw config delete gateway.port
```

### 配对管理（用户访问控制）

```bash
# ========== 查看配对请求 ==========
# 查看待批准的配对请求
pnpm openclaw pairing list feishu

# 批准用户访问
pnpm openclaw pairing approve feishu <配对码>
# 例如: pnpm openclaw pairing approve feishu UFYDTV6T

# ========== 查看和管理白名单 ==========
# 查看已批准的用户列表
cat ~/.openclaw/credentials/feishu-allowFrom.json

# 手动添加用户到白名单（获取 Open ID 后）
# 编辑文件: ~/.openclaw/credentials/feishu-allowFrom.json
# 在 "allowFrom" 数组中添加: "ou_xxxxx"

# 移除用户访问权限
nano ~/.openclaw/credentials/feishu-allowFrom.json
# 从 allowFrom 数组中删除对应的 Open ID

# ========== 配对说明 ==========
# - 配对码: 8 个字符，大写，1 小时后过期
# - 限制: 每个频道最多 3 个待处理请求
# - 生效: 批准后用户可永久使用（除非从白名单移除）
# - 触发: 只在用户首次发消息时需要配对

# ========== 修改 DM 策略（高级）==========
# pairing: 需要配对批准（默认，推荐生产环境）
pnpm openclaw config set channels.feishu.dmPolicy pairing

# open: 任何人都可使用（不安全，仅测试环境）
pnpm openclaw config set channels.feishu.dmPolicy open

# deny: 拒绝所有 DM
pnpm openclaw config set channels.feishu.dmPolicy deny
```

### 健康检查

```bash
# 运行健康检查
pnpm openclaw doctor

# 自动修复配置问题
pnpm openclaw doctor --fix
```

---

## 🧪 测试和开发

### 发送测试消息

```bash
# 使用 agent 命令测试
pnpm openclaw agent --message "你好"

# 指定思考级别
pnpm openclaw agent --message "帮我分析这段代码" --thinking high

# 发送消息到特定通道
pnpm openclaw message send --to +1234567890 --message "测试消息"
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行测试并查看覆盖率
pnpm test:coverage

# 运行 E2E 测试
pnpm test:e2e

# 监视模式运行测试
pnpm test:watch
```

### 代码检查和格式化

```bash
# 运行所有检查 (lint + format + build)
pnpm check

# 仅检查代码风格
pnpm lint

# 修复代码风格问题
pnpm lint:fix

# 检查代码格式
pnpm format

# 自动格式化代码
pnpm format:fix
```

### 构建和清理

```bash
# 完整构建
pnpm build

# 清理并重新构建
rm -rf dist node_modules
pnpm install
pnpm build

# 仅构建 UI
pnpm ui:build

# 开发模式 (热重载)
pnpm ui:dev
```

---

## 📱 移动端和桌面应用

### macOS 应用

```bash
# 打包 macOS 应用
pnpm mac:package

# 打开 macOS 应用
pnpm mac:open

# 重启 macOS 应用
pnpm mac:restart
```

### iOS 应用

```bash
# 生成 Xcode 项目
pnpm ios:gen

# 打开 Xcode 项目
pnpm ios:open

# 构建 iOS 应用
pnpm ios:build

# 运行 iOS 应用
pnpm ios:run
```

### Android 应用

```bash
# 构建 Android APK
pnpm android:assemble

# 安装到设备
pnpm android:install

# 运行 Android 应用
pnpm android:run

# 运行测试
pnpm android:test
```

---

## 🔌 通道管理

### 登录通道

```bash
# WhatsApp 登录
pnpm openclaw channels login

# 查看二维码登录状态
pnpm openclaw channels status
```

### 配对设备

```bash
# 查看配对请求
pnpm openclaw pairing list

# 批准配对请求
pnpm openclaw pairing approve <channel> <code>

# 拒绝配对请求
pnpm openclaw pairing reject <channel> <code>
```

---

## 🛠️ 常见问题排查

### 端口占用问题

```bash
# 查看端口占用情况
lsof -i :18789

# 释放端口
kill $(lsof -t -i :18789)

# 或使用强制启动
pnpm openclaw gateway --port 18789 --force
```

### 模块找不到错误

```bash
# 重新安装依赖
rm -rf node_modules dist
pnpm install
pnpm build
```

### 权限问题

```bash
# macOS 权限诊断
./scripts/clawlog.sh

# 检查系统权限
pnpm openclaw doctor

# 清理缓存
rm -rf ~/.openclaw/cache
```

### 数据库问题

```bash
# 清理会话数据
rm -rf ~/.openclaw/sessions

# 重置配置
rm ~/.openclaw/openclaw.json
pnpm openclaw configure
```

---

## 📊 性能监控

### 查看资源使用

```bash
# 查看进程状态
ps aux | grep openclaw

# 查看内存使用
top -pid $(pgrep -f "openclaw gateway")

# 查看网络连接
netstat -an | grep 18789

# 查看文件打开情况
lsof -p $(pgrep -f "openclaw gateway")
```

---

## 🔄 更新和维护

### 更新 OpenClaw

```bash
# 拉取最新代码
git pull origin main

# 重新安装依赖并构建
pnpm install
pnpm build

# 运行迁移检查
pnpm openclaw doctor

# 使用更新命令 (如果是 npm 安装)
openclaw update --channel stable
```

### 备份和恢复

```bash
# 备份工作区
tar -czf openclaw-workspace-backup.tar.gz ~/.openclaw/workspace

# 备份配置
cp ~/.openclaw/openclaw.json ~/openclaw-config-backup.json

# 恢复备份
tar -xzf openclaw-workspace-backup.tar.gz -C ~/
cp ~/openclaw-config-backup.json ~/.openclaw/openclaw.json
```

---

## 📚 有用的链接

- 官网: https://openclaw.ai
- 文档: https://docs.openclaw.ai
- GitHub: https://github.com/openclaw/openclaw
- Discord: https://discord.gg/clawd

---

## 💡 快捷命令

### 一键启动

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
alias oc-start="cd ~/openclaw && pnpm openclaw gateway --port 18789"
alias oc-stop="pkill -f 'openclaw gateway'"
alias oc-logs="tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"
alias oc-status="pnpm openclaw channels status"
alias oc-web="open http://127.0.0.1:18789/"
```

### 使用快捷命令

```bash
# 启动
oc-start

# 停止
oc-stop

# 查看日志
oc-logs

# 查看状态
oc-status

# 打开 Web UI
oc-web
```

---

**最后更新**: 2026-02-04
