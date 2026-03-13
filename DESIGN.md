# WosClaw Manager — 设计文档

本文档描述 WosClaw Manager 的整体架构设计及每个功能步骤的实现原理。

---

## 目录

1. [整体架构](#1-整体架构)
2. [进程通信模型（IPC）](#2-进程通信模型ipc)
3. [步骤一：欢迎页实现](#3-步骤一欢迎页实现)
4. [步骤二：环境检查实现](#4-步骤二环境检查实现)
5. [步骤三：安装 OpenClaw 实现](#5-步骤三安装-openclaw-实现)
6. [步骤四：配置 Provider 实现](#6-步骤四配置-provider-实现)
7. [步骤五：选择模型实现](#7-步骤五选择模型实现)
8. [步骤六：配置渠道实现](#8-步骤六配置渠道实现)
9. [步骤七：部署实现](#9-步骤七部署实现)
10. [配置文件结构](#10-配置文件结构)
11. [安全设计](#11-安全设计)
12. [打包与分发设计](#12-打包与分发设计)

---

## 1. 整体架构

WosClaw Manager 基于 **Electron** 框架构建，采用标准的 Electron 双进程架构：

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 应用                         │
│                                                         │
│  ┌──────────────────┐        ┌──────────────────────┐  │
│  │   Main Process   │  IPC   │  Renderer Process    │  │
│  │   (main.js)      │◄──────►│  (renderer/          │  │
│  │                  │        │   index.html)        │  │
│  │  - 窗口管理       │        │                      │  │
│  │  - 系统调用       │        │  - 向导 UI           │  │
│  │  - 文件读写       │        │  - 状态管理          │  │
│  │  - 子进程执行     │        │  - 用户交互          │  │
│  └──────────────────┘        └──────────────────────┘  │
│           │                           │                 │
│           └──────── preload.js ───────┘                 │
│                   (Context Bridge)                      │
└─────────────────────────────────────────────────────────┘
```

### 文件职责

| 文件 | 进程 | 职责 |
|------|------|------|
| `main.js` | Main Process | 创建窗口、注册 IPC Handler、执行系统命令、读写文件 |
| `preload.js` | 桥接层 | 通过 `contextBridge` 将安全的 API 暴露给渲染进程 |
| `renderer/index.html` | Renderer Process | 完整的向导 UI，包含所有页面的 HTML、CSS、JavaScript |
| `renderer/styles.css` | Renderer Process | 深色主题 UI 样式 |

---

## 2. 进程通信模型（IPC）

Electron 的安全模型要求渲染进程不能直接访问 Node.js API。WosClaw Manager 通过以下机制实现安全通信：

### Context Bridge（preload.js）

```
Renderer (index.html)
    │
    │  window.electronAPI.checkEnvironment()
    ▼
preload.js (contextBridge)
    │
    │  ipcRenderer.invoke('check-environment')
    ▼
main.js (ipcMain.handle)
    │
    │  执行系统命令 / 读写文件
    ▼
返回结果给 Renderer
```

`preload.js` 使用 `contextBridge.exposeInMainWorld` 将以下 API 暴露给渲染进程：

| API | IPC Channel | 说明 |
|-----|-------------|------|
| `checkEnvironment()` | `check-environment` | 检查 Node.js/npm/Git |
| `checkOpenclaw()` | `check-openclaw` | 检查 openclaw 命令 |
| `installOpenclaw()` | `install-openclaw` | npm 安装 openclaw |
| `saveOpenclawConfig(config)` | `save-openclaw-config` | 写入配置文件 |
| `runOpenclawInit(args)` | `run-openclaw-init` | 执行 openclaw 命令 |
| `runOpenclawConfig(action, sub)` | `run-openclaw-config` | 执行 openclaw 子命令 |
| `openUrl(url)` | `open-url` | 用系统浏览器打开 URL |
| `openPath(path)` | `open-path` | 用文件管理器打开目录 |
| `getHomeDir()` | `get-home-dir` | 获取用户主目录 |
| `onCommandOutput(cb)` | `command-output` (监听) | 实时接收命令输出 |

### 实时输出流

命令执行时，`main.js` 通过 `mainWindow.webContents.send('command-output', ...)` 将子进程的 stdout/stderr 实时推送到渲染进程，渲染进程通过 `ipcRenderer.on('command-output', cb)` 监听并追加到终端 UI。

---

## 3. 步骤一：欢迎页实现

**实现原理：纯静态 HTML**

欢迎页是纯静态展示页面，无需任何 IPC 调用。

```javascript
// 页面切换机制
function showPage(n) {
  // 隐藏所有 .page 元素
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // 显示目标页面
  document.getElementById('page-' + n).classList.add('active');
  // 更新侧边栏步骤状态
  document.querySelectorAll('.step-item').forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i < n) item.classList.add('completed');
    else if (i === n) item.classList.add('active');
  });
  STATE.currentPage = n;
}
```

**状态管理**

所有向导状态存储在全局 `STATE` 对象中，贯穿整个向导流程：

```javascript
const STATE = {
  currentPage: 0,
  provider: 'wosclaw',
  apiKey: '',
  profileName: 'default',
  modelId: 'claude-opus-4-6',
  channel: 'feishu',
  feishuAppId: '',
  feishuAppSecret: '',
  botToken: '',
  deployedPort: 28789,
};
```

---

## 4. 步骤二：环境检查实现

**实现原理：系统命令探测**

`main.js` 中的 `checkCommand(cmd)` 函数通过执行 `where <cmd>`（Windows）或 `which <cmd>`（Unix）来判断命令是否存在：

```javascript
function checkCommand(cmd) {
  return new Promise((resolve) => {
    const check = process.platform === 'win32' ? 'where ' + cmd : 'which ' + cmd;
    exec(check, (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}
```

版本号通过执行 `<cmd> --version` 并用正则 `/(\d+\.\d+[\.\d]*)/` 提取：

```javascript
function getVersion(cmd) {
  return new Promise((resolve) => {
    exec(cmd + ' --version', (err, stdout, stderr) => {
      if (err) { resolve(null); return; }
      const out = (stdout || stderr || '').trim();
      const m = out.match(/(\d+\.\d+[\.\d]*)/);
      resolve(m ? m[1] : out.split('\n')[0].slice(0, 40));
    });
  });
}
```

**检查流程**

```
Renderer: runEnvCheck()
    │
    ├─► window.electronAPI.checkEnvironment()
    │       │
    │       ▼ (IPC: check-environment)
    │   main.js: 并行检查 node / npm / git
    │       │
    │       ▼
    │   返回 Array<{name, required, installed, version, installUrl, description}>
    │
    └─► renderEnvResults(results)
            │
            ├─ 所有必须项已安装 → 显示成功提示，启用"继续"按钮
            └─ 有缺失项 → 显示安装指引卡片，禁用"继续"按钮
```

---

## 5. 步骤三：安装 OpenClaw 实现

**实现原理：npm 子进程 + 实时流输出**

安装通过 Node.js 的 `child_process.spawn` 执行，而非 `exec`，原因是 `spawn` 支持流式输出，可以实时将安装日志推送到 UI：

```javascript
function runCommand(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: true, env: ... });

    proc.stdout.on('data', (data) => {
      // 实时推送到渲染进程
      mainWindow.webContents.send('command-output', {
        type: 'stdout',
        text: data.toString()
      });
    });

    proc.stderr.on('data', (data) => {
      mainWindow.webContents.send('command-output', {
        type: 'stderr',
        text: data.toString()
      });
    });

    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error('exit ' + code + ': ' + stderr));
    });
  });
}
```

**安装命令**

```bash
npm install -g openclaw@latest
```

附加环境变量解决 SSH/HTTPS 协议问题：

```javascript
env: {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_0: 'ssh://git@github.com/',
}
```

**渲染进程监听输出**

```javascript
window.electronAPI.onCommandOutput((data) => {
  appendLog('install-log', data.text, data.type);
});
```

`appendLog` 将文本追加到 `<div class="terminal">` 元素并自动滚动到底部。

---

## 6. 步骤四：配置 Provider 实现

**实现原理：纯前端状态管理**

Provider 选择和 API Key 输入完全在渲染进程中处理，无需 IPC 调用。

**Provider 卡片选择**

```javascript
document.querySelectorAll('.provider-card').forEach(card => {
  card.addEventListener('click', () => {
    // 移除所有选中状态
    document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
    // 选中当前卡片
    card.classList.add('selected');
    STATE.provider = card.dataset.provider;
    updateProviderHint(); // 更新 API Key 获取链接
  });
});
```

**表单验证**

点击"继续"时验证 API Key 非空：

```javascript
$('btn-provider-next').addEventListener('click', () => {
  const apiKey = $('input-api-key').value.trim();
  if (!apiKey) {
    // 高亮输入框边框为红色，2秒后恢复
    $('input-api-key').style.borderColor = 'var(--error)';
    setTimeout(() => { $('input-api-key').style.borderColor = ''; }, 2000);
    return;
  }
  STATE.apiKey = apiKey;
  STATE.profileName = $('input-profile-name').value.trim() || 'default';
  showPage(4);
});
```

---

## 7. 步骤五：选择模型实现

**实现原理：动态渲染模型列表**

模型列表由 `MODEL_CATALOG` 数组驱动，动态生成 HTML：

```javascript
const MODEL_CATALOG = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', desc: '最强能力，适合复杂任务' },
  // ...
];

function renderModelList() {
  let html = '';
  for (const m of MODEL_CATALOG) {
    const selected = m.id === STATE.modelId ? 'selected' : '';
    html += `<div class="provider-card ${selected}" data-model-id="${m.id}">...</div>`;
  }
  $('model-list').innerHTML = html;

  // 绑定点击事件
  document.querySelectorAll('[data-model-id]').forEach(card => {
    card.addEventListener('click', () => {
      STATE.modelId = card.dataset.modelId;
      // 更新选中状态...
    });
  });
}
```

---

## 8. 步骤六：配置渠道实现

**实现原理：条件渲染 + 表单验证**

根据选中的渠道动态显示/隐藏对应的配置表单：

```javascript
function updateChannelForm() {
  if (STATE.channel === 'feishu') {
    $('feishu-config').style.display = 'block';
    $('telegram-config').style.display = 'none';
  } else {
    $('feishu-config').style.display = 'none';
    $('telegram-config').style.display = 'block';
  }
}
```

**表单验证逻辑**

```javascript
$('btn-channel-next').addEventListener('click', () => {
  if (STATE.channel === 'feishu') {
    const appId = $('input-feishu-app-id').value.trim();
    const appSecret = $('input-feishu-app-secret').value.trim();
    if (!appId || !appSecret) {
      // 显示错误提示
      return;
    }
    STATE.feishuAppId = appId;
    STATE.feishuAppSecret = appSecret;
  } else if (STATE.channel === 'telegram') {
    const token = $('input-bot-token').value.trim();
    if (!token) { return; }
    STATE.botToken = token;
  }
  startDeploy();
});
```

---

## 9. 步骤七：部署实现

**实现原理：多步骤异步流程 + 进度追踪**

部署流程是整个应用最复杂的部分，分为以下几个阶段：

### 阶段一：生成配置对象

根据 `STATE` 中收集的所有信息，构建符合 OpenClaw 规范的 JSON 配置对象：

```javascript
const config = {
  models: {
    providers: {
      anthropic: {
        api: 'anthropic-messages',
        baseUrl: 'https://api.minimaxi.com/anthropic',
        apiKey: STATE.apiKey,
        models: [{ id: model.id, name: model.name, ... }],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: 'anthropic/' + model.id },
    },
  },
  gateway: { port: 28789 },
};
```

**飞书渠道配置追加：**

```javascript
config.channels = {
  feishu: {
    enabled: true,
    dmPolicy: 'pairing',
    groupPolicy: 'open',
    requireMention: true,
    accounts: {
      main: {
        appId: STATE.feishuAppId,
        appSecret: STATE.feishuAppSecret,
      },
    },
  },
};
config.plugins = { entries: { feishu: { enabled: true } } };
```

### 阶段二：写入配置文件

通过 IPC 调用 `main.js` 中的文件写入 Handler：

```javascript
// main.js
ipcMain.handle('save-openclaw-config', async (event, config, profileName) => {
  const suffix = profileName === 'default' ? '' : '-' + profileName;
  const dir = path.join(os.homedir(), '.openclaw' + suffix);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openclaw.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );
  return { success: true };
});
```

配置文件路径规则：

| 实例名称 | 目录 |
|----------|------|
| `default` | `~/.openclaw/` |
| `work` | `~/.openclaw-work/` |

### 阶段三：运行 openclaw onboard

```javascript
const onboardArgs = [
  'onboard',
  '--install-daemon',
  '--flow', 'quickstart',
  '--accept-risk',
  '--skip-skills',
  '--skip-channels',
  '--skip-ui',
  '--skip-health',
  '--non-interactive',
  '--gateway-port', '28789',
];
await window.electronAPI.runOpenclawInit(onboardArgs);
```

`--non-interactive` 参数确保命令不会等待用户输入，`--skip-channels` 跳过渠道配置（因为我们已经手动写入了配置文件）。

### 阶段四：重启网关

```javascript
await window.electronAPI.runOpenclawConfig('gateway', 'restart');
```

此步骤为非致命操作，失败时仅记录警告日志，不中断部署流程。

### 进度条实现

```javascript
function updateProgress(pct, msg) {
  $('deploy-progress-bar').style.width = pct + '%';
  $('deploy-pct').textContent = pct + '%';
  $('deploy-status-desc').textContent = msg;
  appendLog('deploy-log', `[${pct}%] ${msg}\n`, 'info');
}
```

进度值在各阶段手动设定（5% → 10% → 30% → 50% → 85% → 92% → 100%），通过 CSS `transition` 实现平滑动画。

---

## 10. 配置文件结构

最终生成的 `~/.openclaw/openclaw.json` 完整结构（以飞书渠道为例）：

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "api": "anthropic-messages",
        "baseUrl": "https://api.minimaxi.com/anthropic",
        "apiKey": "<YOUR_API_KEY>",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "Claude Opus 4.6",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-6"
      }
    }
  },
  "gateway": {
    "port": 28789
  },
  "channels": {
    "feishu": {
      "enabled": true,
      "dmPolicy": "pairing",
      "groupPolicy": "open",
      "requireMention": true,
      "accounts": {
        "main": {
          "appId": "<FEISHU_APP_ID>",
          "appSecret": "<FEISHU_APP_SECRET>"
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "feishu": {
        "enabled": true
      }
    }
  }
}
```

---

## 11. 安全设计

### Context Isolation

`main.js` 创建窗口时启用 `contextIsolation: true`，禁用 `nodeIntegration: false`，确保渲染进程无法直接访问 Node.js API：

```javascript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
}
```

### Content Security Policy

`renderer/index.html` 设置了严格的 CSP，防止 XSS 攻击：

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" />
```

### API Key 保护

- API Key 输入框使用 `type="password"` 防止明文显示
- API Key 仅存储在内存中的 `STATE` 对象，不会记录到日志
- 写入配置文件时，文件权限由操作系统的用户目录权限保护

### 外部链接安全

所有外部链接通过 `shell.openExternal(url)` 在系统默认浏览器中打开，而非在 Electron 窗口内加载，避免在应用内执行不受信任的网页代码。

---

## 12. 打包与分发设计

### 打包工具选型

WosClaw Manager 使用 **electron-builder** 进行打包，原因如下：

| 特性 | electron-builder | electron-packager |
|------|-----------------|-------------------|
| 多架构支持 | ✅ 内置 x64/arm64 交叉编译 | 需要手动配置 |
| NSIS 安装包 | ✅ 内置支持 | ❌ 不支持 |
| 自动更新 | ✅ 内置 autoUpdater 集成 | ❌ 不支持 |
| 代码签名 | ✅ 内置支持 | 需要手动配置 |
| 配置方式 | package.json `build` 字段 | 命令行参数 |

### 多架构打包原理

electron-builder 通过以下机制实现在 x64 机器上交叉编译 arm64 包：

```
构建机（x64 Windows）
    │
    ├─► 下载 Electron x64 二进制
    │       └─► 打包为 x64 NSIS 安装包
    │
    └─► 下载 Electron arm64 二进制
            └─► 打包为 arm64 NSIS 安装包
```

Electron 官方为每个版本提供预编译的 x64 和 arm64 二进制文件，electron-builder 在打包时自动下载对应架构的 Electron 运行时，与应用代码合并打包，**无需在 ARM 设备上编译**。

### package.json build 配置解析

```json
{
  "build": {
    "appId": "com.wosclaw.manager",        // 应用唯一标识（反向域名格式）
    "productName": "WosClaw Manager",       // 显示名称
    "directories": {
      "output": "dist",                     // 输出目录
      "buildResources": "assets"            // 图标等资源目录
    },
    "files": [                              // 打包进应用的文件白名单
      "main.js",
      "preload.js",
      "renderer/**/*",
      "package.json"
    ],
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64", "arm64"] },  // NSIS 安装包
        { "target": "zip",  "arch": ["x64", "arm64"] }   // 免安装压缩包
      ],
      "requestedExecutionLevel": "asInvoker",  // 不强制请求管理员权限
      "artifactName": "${productName}-${version}-Windows-${arch}.${ext}"
    },
    "nsis": {
      "oneClick": false,                    // 非一键安装，显示安装向导
      "allowToChangeInstallationDirectory": true,  // 允许用户选择安装目录
      "createDesktopShortcut": true,        // 创建桌面快捷方式
      "createStartMenuShortcut": true,      // 创建开始菜单项
      "artifactName": "${productName}-${version}-Setup-${arch}.${ext}"
    }
  }
}
```

### 文件白名单机制

`files` 字段指定哪些文件会被打包进最终的 `.asar` 归档（Electron 的应用包格式）：

```
打包流程：
源码文件 (main.js, preload.js, renderer/)
    │
    ▼ electron-builder 打包
app.asar (加密归档)
    │
    ▼ 与 Electron 运行时合并
WosClaw Manager.exe (最终可执行文件)
```

`node_modules` 中的 `devDependencies`（如 electron、electron-builder 本身）不会被打包进去，只有 `dependencies` 中的包才会被包含。

> **注意：** 当前 `package.json` 中的 `node-pty` 依赖在实际代码中未使用，可以移除以减小包体积。

### 输出产物命名规则

通过 `artifactName` 模板变量控制输出文件名：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `${productName}` | 产品名称 | `WosClaw Manager` |
| `${version}` | 版本号 | `1.0.0` |
| `${arch}` | 目标架构 | `x64` / `arm64` |
| `${ext}` | 文件扩展名 | `exe` / `zip` |

最终输出示例：
- `WosClaw Manager-1.0.0-Setup-x64.exe`
- `WosClaw Manager-1.0.0-Setup-arm64.exe`
- `WosClaw Manager-1.0.0-Windows-x64.zip`
- `WosClaw Manager-1.0.0-Windows-arm64.zip`

### npm scripts 设计

```json
{
  "start":       "electron .",                              // 开发运行
  "dev":         "electron . --dev",                        // 开发模式（可加调试标志）
  "build:x64":   "electron-builder --win --x64",            // 仅打包 x64
  "build:arm64": "electron-builder --win --arm64",          // 仅打包 arm64
  "build:all":   "electron-builder --win --x64 --arm64",    // 同时打包两种架构
  "build":       "electron-builder --win --x64 --arm64",    // 默认 build 命令
  "pack":        "electron-builder --dir"                   // 仅解包，不生成安装包（用于快速测试）
}
```

`--dir` 模式（`npm run pack`）不生成 NSIS 安装包，只输出解包后的目录，速度更快，适合在打包前验证应用是否能正常运行。
