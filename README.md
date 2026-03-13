# WosClaw Manager — 使用说明文档

WosClaw Manager 是一个基于 Electron 的 Windows 桌面应用，帮助用户一步一步完成 OpenClaw 的安装与初始化配置。

---

## 目录

1. [启动应用](#1-启动应用)
2. [步骤一：欢迎页](#2-步骤一欢迎页)
3. [步骤二：环境检查](#3-步骤二环境检查)
4. [步骤三：安装 OpenClaw](#4-步骤三安装-openclaw)
5. [步骤四：配置 AI Provider](#5-步骤四配置-ai-provider)
6. [步骤五：选择 AI 模型](#6-步骤五选择-ai-模型)
7. [步骤六：配置消息渠道](#7-步骤六配置消息渠道)
8. [步骤七：部署与完成](#8-步骤七部署与完成)
9. [常见问题](#9-常见问题)

---

## 1. 启动应用

### 开发模式运行

```bash
cd wosclaw-manager
npm start
```

---

## 打包为 Windows 安装包

### 前置要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | v18+ | 构建环境 |
| npm | v9+ | 包管理器 |
| Windows SDK | 可选 | 代码签名时需要 |

> **注意：** 打包 arm64 版本不需要 ARM 设备，可以在 x64 Windows 上交叉编译。

---

### 方式一：同时打包 x64 和 arm64（推荐）

```bash
cd wosclaw-manager
npm run build:all
```

等价于：

```bash
npx electron-builder --win --x64 --arm64
```

---

### 方式二：仅打包 x64（适用于普通 Intel/AMD 电脑）

```bash
cd wosclaw-manager
npm run build:x64
```

等价于：

```bash
npx electron-builder --win --x64
```

---

### 方式三：仅打包 arm64（适用于 ARM Windows 设备，如 Surface Pro X）

```bash
cd wosclaw-manager
npm run build:arm64
```

等价于：

```bash
npx electron-builder --win --arm64
```

---

### 输出文件说明

打包完成后，所有文件位于 `wosclaw-manager/dist/` 目录：

```
dist/
├── WosClaw Manager-1.0.0-Setup-x64.exe      # x64 NSIS 安装包
├── WosClaw Manager-1.0.0-Setup-arm64.exe    # arm64 NSIS 安装包
├── WosClaw Manager-1.0.0-Windows-x64.zip    # x64 免安装压缩包
├── WosClaw Manager-1.0.0-Windows-arm64.zip  # arm64 免安装压缩包
└── win-unpacked/                             # 未打包的可执行文件目录
```

| 文件 | 架构 | 格式 | 适用场景 |
|------|------|------|----------|
| `*-Setup-x64.exe` | x64 | NSIS 安装包 | 普通 Intel/AMD Windows 电脑，有安装向导 |
| `*-Setup-arm64.exe` | arm64 | NSIS 安装包 | ARM Windows 设备（Surface Pro X 等） |
| `*-Windows-x64.zip` | x64 | 免安装压缩包 | 解压即用，无需安装 |
| `*-Windows-arm64.zip` | arm64 | 免安装压缩包 | ARM 设备解压即用 |

---

### 安装包特性

- ✅ **可选安装目录**：安装时可自定义安装路径
- ✅ **桌面快捷方式**：安装后自动创建桌面图标
- ✅ **开始菜单**：自动添加到开始菜单
- ✅ **卸载支持**：可通过控制面板正常卸载

---

### 添加应用图标（可选）

在打包前，将 256×256 像素的 `.ico` 文件放置到：

```
wosclaw-manager/assets/icon.ico
```

如果没有 `.ico` 文件，electron-builder 会使用默认的 Electron 图标。

可以使用以下工具将 PNG 转换为 ICO：
- [icoconvert.com](https://icoconvert.com/)
- [convertio.co](https://convertio.co/png-ico/)

---

### 代码签名（生产环境推荐）

未签名的安装包在 Windows 上会触发 SmartScreen 警告。如需签名：

1. 获取代码签名证书（EV 证书或 OV 证书）
2. 在 `package.json` 的 `build.win` 中添加签名配置：

```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "your-password",
  "signingHashAlgorithms": ["sha256"]
}
```

或通过环境变量配置（推荐，避免密码写入代码）：

```bash
set CSC_LINK=path/to/certificate.pfx
set CSC_KEY_PASSWORD=your-password
npm run build:all
```

---

## 2. 步骤一：欢迎页

**界面说明**

打开应用后，首先看到欢迎页，展示 WosClaw Manager 的四大功能：

| 功能 | 说明 |
|------|------|
| 🔍 自动检查运行环境 | 检测 Node.js、npm、Git 是否已安装 |
| 📦 一键安装 OpenClaw | 通过 npm 全局安装 openclaw 命令行工具 |
| ⚙️ 引导式配置向导 | 逐步填写 Provider、Model、Channel 配置 |
| 💬 支持飞书等多渠道 | 支持飞书（Feishu）和 Telegram 两种消息渠道 |

**操作**

点击 **"开始安装配置 →"** 按钮，进入环境检查步骤。

---

## 3. 步骤二：环境检查

**界面说明**

应用自动检测以下依赖是否已安装：

| 依赖 | 是否必须 | 说明 |
|------|----------|------|
| Node.js | ✅ 必须 | OpenClaw 的运行基础，需要 v18 及以上版本 |
| npm | ✅ 必须 | Node 包管理器，用于安装 OpenClaw |
| Git | ⚠️ 推荐 | 版本控制工具，部分功能依赖 |

**检查结果说明**

- ✅ **绿色**：已安装，并显示版本号
- ❌ **红色**：未安装（必须项），需要手动安装
- ⚠️ **黄色**：未安装（可选项），建议安装

**如果有缺失依赖**

页面下方会出现"安装缺失依赖"卡片，列出所有未安装的必须依赖，并提供"下载安装"按钮，点击后会在浏览器中打开对应的官方下载页面。

安装完成后，点击 **"🔄 重新检查"** 按钮重新检测。

**操作**

所有必须依赖均已安装后，**"继续 →"** 按钮变为可点击状态，点击进入下一步。

---

## 4. 步骤三：安装 OpenClaw

**界面说明**

进入此步骤时，应用自动检查 `openclaw` 命令是否已存在于系统中。

**情况一：OpenClaw 已安装**

状态卡片显示 ✅ 绿色，并显示当前版本号，**"继续 →"** 按钮直接可用。

**情况二：OpenClaw 未安装**

状态卡片显示 📦，并出现 **"📥 安装 OpenClaw"** 按钮。

点击安装按钮后：

1. 按钮变为"安装中..."并禁用，防止重复点击
2. 下方展开"安装日志"终端窗口，实时显示 `npm install -g openclaw@latest` 的输出
3. 安装成功后，状态卡片变为 ✅，**"继续 →"** 按钮变为可用
4. 安装失败时，显示错误信息，按钮变为"📥 重试安装"

**操作**

安装完成后，点击 **"继续 →"** 进入 Provider 配置。

---

## 5. 步骤四：配置 AI Provider

**界面说明**

选择 AI 服务提供商，并填写对应的 API Key。

**支持的 Provider**

| Provider | 说明 | API Key 获取地址 |
|----------|------|-----------------|
| 🌐 WosClaw | MiniMax API（默认推荐） | https://wosclaw.ai |
| 🧠 Anthropic | Claude 系列模型 | https://console.anthropic.com |
| ✨ OpenAI | GPT 系列模型 | https://platform.openai.com |

**填写说明**

- **API Key**（必填）：点击下方提示链接可跳转到对应平台获取
- **实例名称**（可选）：为此次配置起一个名字，留空则使用 `default`；如果您需要管理多个 OpenClaw 实例，可以填写不同的名称（如 `work`、`personal`）

**操作**

填写完 API Key 后，点击 **"继续 →"** 进入模型选择。

---

## 6. 步骤五：选择 AI 模型

**界面说明**

根据您的需求选择合适的 AI 模型。

**可选模型**

| 模型 | 说明 |
|------|------|
| Claude Opus 4.6 | 最强能力，适合复杂任务 |
| Claude Opus 4.5 | 强大能力，均衡选择 |
| Claude Sonnet 4.5 | 速度与能力的平衡 |
| Claude Haiku 4.5 | 快速响应，轻量任务 |
| Claude Sonnet 4 | 稳定可靠 |
| MiniMax 2.5 | 免费使用 |

点击模型卡片即可选中（右侧显示 ✓ 标记）。

**操作**

选择模型后，点击 **"继续 →"** 进入渠道配置。

---

## 7. 步骤六：配置消息渠道

**界面说明**

选择 OpenClaw 接收用户消息的渠道。

### 飞书（Feishu）配置

**前置步骤：**

1. 前往 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用
2. 在"凭证与基础信息"页面获取 **App ID** 和 **App Secret**
3. 在"机器人"功能页面开启机器人能力
4. 在"事件订阅"页面，选择"使用 WebSocket 接收事件"并保存

**填写说明：**

| 字段 | 示例 | 说明 |
|------|------|------|
| Feishu App ID | `cli_xxxxxxxxxxxxxxxx` | 飞书应用的唯一标识 |
| Feishu App Secret | `xxxxxxxxxxxxxxxx` | 飞书应用的密钥，请妥善保管 |

### Telegram 配置

**前置步骤：**

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令创建新机器人
3. 按提示设置机器人名称，获取 **Bot Token**

**填写说明：**

| 字段 | 示例 | 说明 |
|------|------|------|
| Bot Token | `123456789:ABCdef...` | BotFather 提供的机器人令牌 |

**操作**

填写完成后，点击 **"开始部署 🚀"** 进入部署流程。

---

## 8. 步骤七：部署与完成

### 部署过程

应用会自动执行以下操作，并通过进度条和日志实时展示：

| 进度 | 操作 |
|------|------|
| 5% | 创建配置目录 |
| 10% | 生成配置文件内容 |
| 30% | 写入 `~/.openclaw/openclaw.json` |
| 50% | 运行 `openclaw onboard` 初始化 |
| 85% | 应用最终配置 |
| 92% | 重启网关服务 |
| 100% | 部署完成 |

### 配置文件位置

| 实例名称 | 配置文件路径 |
|----------|-------------|
| default | `C:\Users\<用户名>\.openclaw\openclaw.json` |
| 自定义名称（如 work） | `C:\Users\<用户名>\.openclaw-work\openclaw.json` |

### 完成页面

部署成功后，显示配置摘要：

- **实例名称**
- **Provider**
- **模型**
- **渠道**
- **网关端口**（默认 28789）

**飞书后续步骤：**

前往飞书开放平台 → 事件订阅 → 选择"使用 WebSocket 接收事件"并保存，然后向机器人发送消息即可开始使用。

**Telegram 后续步骤：**

直接向您的 Telegram 机器人发送消息即可开始使用。

**操作按钮：**

- **📁 打开配置目录**：在文件资源管理器中打开配置文件所在目录
- **完成 ✓**：返回欢迎页，可以继续配置新的实例

---

## 9. 常见问题

### Q: 安装 OpenClaw 时提示权限不足？

以管理员身份运行 WosClaw Manager，或在管理员权限的命令行中手动执行：

```bash
npm install -g openclaw@latest
```

### Q: 飞书机器人收不到消息？

1. 确认已在飞书开放平台开启"机器人"功能
2. 确认事件订阅选择了"使用 WebSocket 接收事件"
3. 确认 OpenClaw 网关服务正在运行（端口 28789）

### Q: 如何修改已有配置？

直接编辑配置文件 `~/.openclaw/openclaw.json`，或重新运行 WosClaw Manager 配置新实例。

### Q: 如何管理多个 OpenClaw 实例？

在"配置 Provider"步骤中填写不同的"实例名称"，每个实例会使用独立的配置目录。

### Q: 网关端口 28789 被占用怎么办？

编辑配置文件中的 `gateway.port` 字段，修改为其他可用端口，然后重启 OpenClaw 服务。