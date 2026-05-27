import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nextWebDir = path.join(rootDir, 'next-web');
const stateDir = path.join(rootDir, '.prompix');

const host = '127.0.0.1';
const port = 4300;
const serverUrl = `http://${host}:${port}`;
const publicUrl = `http://localhost:${port}`;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shouldOpenBrowser = process.env.PROMPIX_NO_OPEN !== '1';

const MODES = {
  stable: {
    name: 'stable',
    displayName: '稳定演示模式',
    distDir: '.next',
    pidFile: path.join(stateDir, 'next-web-stable.pid'),
    logFile: path.join(stateDir, 'next-web-stable.log'),
    npmRunArgs: ['run', 'start', '--', '--hostname', host],
    requireBuild: true,
  },
  dev: {
    name: 'dev',
    displayName: '开发模式',
    distDir: '.next-dev',
    pidFile: path.join(stateDir, 'next-web-dev.pid'),
    logFile: path.join(stateDir, 'next-web-dev.log'),
    npmRunArgs: ['run', 'dev', '--', '--hostname', host],
    requireBuild: false,
  },
};

const parseArgs = (argv) => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eqIndex = token.indexOf('=');
    if (eqIndex > -1) {
      result[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readPid = (pidFile) => {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};

const removePidFile = (pidFile) => {
  fs.rmSync(pidFile, { force: true });
};

const killWithWait = async (pid) => {
  if (!isProcessAlive(pid)) return;
  process.kill(pid, 'SIGTERM');

  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
    if (!isProcessAlive(pid)) return;
  }

  if (isProcessAlive(pid)) {
    process.kill(pid, 'SIGKILL');
  }
};

const request = (targetUrl) => {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          body,
          headers: res.headers || {},
        });
      });
    });

    req.on('error', () => {
      resolve({ ok: false, status: 0, body: '', headers: {} });
    });

    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', headers: {} });
    });
  });
};

const extractStylesheetUrl = (html) => {
  if (!html) return null;
  const match = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i);
  if (!match?.[1]) return null;
  const href = match[1].trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `http:${href}`;
  return `${serverUrl}${href.startsWith('/') ? '' : '/'}${href}`;
};

const verifyServerHealth = async () => {
  const page = await request(`${serverUrl}/`);
  if (!page.ok) return false;

  const cssUrl = extractStylesheetUrl(page.body);
  if (!cssUrl) return false;

  const css = await request(cssUrl);
  if (!css.ok) return false;

  const contentType = String(css.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('text/css')) return false;

  return css.body.length > 128;
};

const waitForHealthyServer = async (retry = 80) => {
  for (let i = 0; i < retry; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const healthy = await verifyServerHealth();
    if (healthy) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  return false;
};

const openBrowser = (targetUrl) => {
  let cmd = 'xdg-open';
  let args = [targetUrl];

  if (process.platform === 'darwin') {
    cmd = 'open';
  } else if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', targetUrl];
  }

  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
};

const ensureDependencies = () => {
  const localNodeModules = path.join(nextWebDir, 'node_modules');
  if (fs.existsSync(localNodeModules)) return;

  console.log('[Prompix] 首次启动，正在安装 next-web 依赖...');
  const installed = spawnSync(npmCmd, ['install'], {
    cwd: nextWebDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (installed.status !== 0) {
    throw new Error('next-web 依赖安装失败，请手动执行 npm --prefix ./next-web install');
  }
};

const listManagedProcesses = () => {
  return Object.values(MODES).map((mode) => {
    const pid = readPid(mode.pidFile);
    const alive = Boolean(pid && isProcessAlive(pid));
    return { ...mode, pid, alive };
  });
};

const stopManagedProcess = async (mode) => {
  if (!mode.pid) {
    removePidFile(mode.pidFile);
    return;
  }

  await killWithWait(mode.pid);
  removePidFile(mode.pidFile);
};

const buildForStableMode = (mode) => {
  console.log('[Prompix] 正在构建稳定演示包...');
  const buildEnv = {
    ...process.env,
    PROMPIX_NEXT_DIST_DIR: mode.distDir,
  };
  const built = spawnSync(npmCmd, ['run', 'build'], {
    cwd: nextWebDir,
    stdio: 'inherit',
    env: buildEnv,
  });

  if (built.status !== 0) {
    throw new Error('稳定模式构建失败，请查看终端输出。');
  }
};

const startManagedServer = (mode) => {
  fs.mkdirSync(stateDir, { recursive: true });
  const outFd = fs.openSync(mode.logFile, 'a');

  const child = spawn(npmCmd, mode.npmRunArgs, {
    cwd: nextWebDir,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      PROMPIX_NEXT_DIST_DIR: mode.distDir,
    },
  });

  child.unref();
  fs.writeFileSync(mode.pidFile, String(child.pid));
};

const main = async () => {
  if (!fs.existsSync(nextWebDir)) {
    throw new Error(`未找到 next-web 目录：${nextWebDir}`);
  }

  const args = parseArgs(process.argv.slice(2));
  const requestedModeName = String(args.mode || process.env.PROMPIX_BOOT_MODE || 'stable').toLowerCase();
  const mode = MODES[requestedModeName];
  if (!mode) {
    throw new Error(`不支持的模式：${requestedModeName}。可用值：stable | dev`);
  }

  ensureDependencies();

  const managed = listManagedProcesses();
  const sameMode = managed.find((item) => item.name === mode.name);
  const otherModes = managed.filter((item) => item.name !== mode.name && item.alive);

  if (sameMode?.alive) {
    const healthy = await verifyServerHealth();
    if (healthy) {
      console.log(`[Prompix] ${mode.displayName}已在运行，正在打开：${publicUrl}`);
      if (shouldOpenBrowser) openBrowser(publicUrl);
      return;
    }

    console.log(`[Prompix] 检测到 ${mode.displayName}进程异常，正在重启...`);
    await stopManagedProcess(sameMode);
  } else if (sameMode?.pid) {
    removePidFile(mode.pidFile);
  }

  for (const other of otherModes) {
    console.log(`[Prompix] 正在停止受管${other.displayName}进程（PID: ${other.pid}）...`);
    // eslint-disable-next-line no-await-in-loop
    await stopManagedProcess(other);
  }

  const isPortServing = (await request(`${serverUrl}/`)).ok;
  if (isPortServing) {
    const healthy = await verifyServerHealth();
    if (!healthy) {
      throw new Error('检测到 4300 端口已有非受管服务且健康检查失败，请先关闭该服务后重试。');
    }

    console.log('[Prompix] 检测到 4300 端口已有非受管服务，直接打开。建议后续统一使用根目录启动器。');
    if (shouldOpenBrowser) openBrowser(publicUrl);
    return;
  }

  if (mode.requireBuild) {
    buildForStableMode(mode);
  }

  console.log(`[Prompix] 正在后台启动 ${mode.displayName}...`);
  startManagedServer(mode);

  const ok = await waitForHealthyServer(80);
  if (!ok) {
    throw new Error(`启动超时或样式资源异常，请查看日志：${mode.logFile}`);
  }

  console.log(`[Prompix] 启动完成（${mode.displayName}）：${publicUrl}`);
  if (shouldOpenBrowser) openBrowser(publicUrl);
};

main().catch((error) => {
  console.error('[Prompix] 启动失败：', error.message);
  process.exit(1);
});
