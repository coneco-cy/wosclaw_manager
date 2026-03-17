const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'WosClaw Manager',
    icon: iconPath,
    show: false,
    backgroundColor: '#0f172a',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function runCommand(cmd, args, options) {
  options = options || {};
  return new Promise((resolve, reject) => {
    // Print the command line before executing
    if (mainWindow) mainWindow.webContents.send('command-output', { type: 'info', text: '> ' + [cmd, ...args].join(' ') + '\n' });

    const proc = spawn(cmd, args, {
      shell: true,
      env: Object.assign({}, process.env, options.env || {}),
      cwd: options.cwd || process.cwd(),
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (mainWindow) mainWindow.webContents.send('command-output', { type: 'stdout', text });
    });
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (mainWindow) mainWindow.webContents.send('command-output', { type: 'stderr', text });
    });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error('exit ' + code + ': ' + (stderr || stdout).slice(0, 200)));
    });
    proc.on('error', reject);
  });
}

function checkCommand(cmd) {
  return new Promise((resolve) => {
    exec(process.platform === 'win32' ? 'where ' + cmd : 'which ' + cmd, (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

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

ipcMain.handle('check-environment', async () => {
  function sendLog(type, text) {
    if (mainWindow) mainWindow.webContents.send('command-output', { type, text });
  }

  const checks = [
    { name: 'Node.js', cmd: 'node', required: true, installUrl: 'https://nodejs.org/', description: 'JavaScript 运行时，OpenClaw 的运行基础（需要 v18+）' },
    { name: 'npm',     cmd: 'npm',  required: true, installUrl: 'https://nodejs.org/', description: 'Node 包管理器，随 Node.js 一起安装' },
    { name: 'Git',     cmd: 'git',  required: false, installUrl: 'https://git-scm.com/', description: '版本控制工具（推荐安装）' },
  ];

  const results = [];
  for (const check of checks) {
    const whereCmd = process.platform === 'win32' ? 'where ' + check.cmd : 'which ' + check.cmd;
    sendLog('info', `> ${whereCmd}\n`);
    const installed = await checkCommand(check.cmd);
    if (installed) {
      const version = await getVersion(check.cmd);
      const versionCmd = check.cmd + ' --version';
      sendLog('info', `> ${versionCmd}\n`);
      sendLog('stdout', `  ✅ ${check.name}${version ? ' v' + version : ''} 已安装\n`);
      results.push({ name: check.name, required: check.required, installed: true, version, installUrl: check.installUrl, description: check.description });
    } else {
      sendLog('stderr', `  ❌ ${check.name} 未找到，请先安装\n`);
      results.push({ name: check.name, required: check.required, installed: false, version: null, installUrl: check.installUrl, description: check.description });
    }
  }
  return results;
});

ipcMain.handle('check-openclaw', async () => {
  function sendLog(type, text) {
    if (mainWindow) mainWindow.webContents.send('command-output', { type, text });
  }
  const whereCmd = process.platform === 'win32' ? 'where openclaw' : 'which openclaw';
  sendLog('info', `> ${whereCmd}\n`);
  const ok = await checkCommand('openclaw');
  if (ok) {
    sendLog('info', '> openclaw --version\n');
    const version = await getVersion('openclaw');
    sendLog('stdout', `  ✅ openclaw${version ? ' v' + version : ''} 已安装\n`);
    return { installed: true, version };
  } else {
    sendLog('stderr', '  ❌ openclaw 未找到，需要安装\n');
    return { installed: false, version: null };
  }
});

ipcMain.handle('install-openclaw', async () => {
  try {
    await runCommand('npm', ['install', '-g', 'openclaw@latest'], {
      env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf', GIT_CONFIG_VALUE_0: 'ssh://git@github.com/' },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function openclawConfigPath(profileName) {
  const suffix = (!profileName || profileName === 'default') ? '' : '-' + profileName;
  const dir = path.join(os.homedir(), '.openclaw' + suffix);
  return { dir, file: path.join(dir, 'openclaw.json') };
}

ipcMain.handle('read-openclaw-config', async (event, profileName) => {
  try {
    const { file } = openclawConfigPath(profileName);
    if (fs.existsSync(file)) return { success: true, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
    return { success: true, config: {} };
  } catch (err) { return { success: false, error: err.message, config: {} }; }
});

ipcMain.handle('save-openclaw-config', async (event, config, profileName) => {
  try {
    const { dir, file } = openclawConfigPath(profileName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('run-openclaw-init', async (event, args) => {
  try {
    await runCommand('openclaw', args || []);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('run-openclaw-config', async (event, action, subAction) => {
  try {
    await runCommand('openclaw', [action, subAction]);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('open-url', async (event, url) => { await shell.openExternal(url); return { success: true }; });
ipcMain.handle('open-path', async (event, p) => { await shell.openPath(p); return { success: true }; });
ipcMain.handle('get-home-dir', async () => os.homedir());
ipcMain.handle('verify-openclaw', async () => {
  try { const r = await runCommand('openclaw', ['--version']); return { success: true, output: r.stdout }; }
  catch (err) { return { success: false, error: err.message }; }
});