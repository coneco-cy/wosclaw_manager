const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
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
  const nodeOk = await checkCommand('node');
  const npmOk = await checkCommand('npm');
  const gitOk = await checkCommand('git');
  return [
    { name: 'Node.js', required: true, installed: nodeOk, version: nodeOk ? await getVersion('node') : null, installUrl: 'https://nodejs.org/', description: 'JavaScript 运行时，OpenClaw 的运行基础（需要 v18+）' },
    { name: 'npm',     required: true, installed: npmOk,  version: npmOk  ? await getVersion('npm')  : null, installUrl: 'https://nodejs.org/', description: 'Node 包管理器，随 Node.js 一起安装' },
    { name: 'Git',     required: false, installed: gitOk, version: gitOk  ? await getVersion('git')  : null, installUrl: 'https://git-scm.com/', description: '版本控制工具（推荐安装）' },
  ];
});

ipcMain.handle('check-openclaw', async () => {
  const ok = await checkCommand('openclaw');
  return { installed: ok, version: ok ? await getVersion('openclaw') : null };
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