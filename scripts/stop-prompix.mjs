import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const stateDir = path.join(rootDir, '.prompix');

const MODES = {
  stable: {
    name: 'stable',
    displayName: '稳定演示模式',
    pidFile: path.join(stateDir, 'next-web-stable.pid'),
  },
  dev: {
    name: 'dev',
    displayName: '开发模式',
    pidFile: path.join(stateDir, 'next-web-dev.pid'),
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const killWithWait = async (pid) => {
  if (!isProcessAlive(pid)) return;
  process.kill(pid, 'SIGTERM');

  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(150);
    if (!isProcessAlive(pid)) return;
  }

  if (isProcessAlive(pid)) {
    process.kill(pid, 'SIGKILL');
  }
};

const stopMode = async (mode) => {
  const pid = readPid(mode.pidFile);
  if (!pid) {
    fs.rmSync(mode.pidFile, { force: true });
    return false;
  }

  await killWithWait(pid);
  fs.rmSync(mode.pidFile, { force: true });
  console.log(`[Prompix] 已停止${mode.displayName}（PID: ${pid}）。`);
  return true;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const target = String(args.mode || 'all').toLowerCase();

  if (target !== 'all' && !MODES[target]) {
    throw new Error(`不支持的 mode: ${target}。可用值：all | stable | dev`);
  }

  const modes = target === 'all' ? Object.values(MODES) : [MODES[target]];

  let stoppedAny = false;
  for (const mode of modes) {
    // eslint-disable-next-line no-await-in-loop
    const stopped = await stopMode(mode);
    stoppedAny = stoppedAny || stopped;
  }

  if (!stoppedAny) {
    console.log('[Prompix] 未发现受管启动记录，无需停止。');
  }
};

main().catch((error) => {
  console.error('[Prompix] 停止失败：', error.message);
  process.exit(1);
});
