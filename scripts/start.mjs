import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const parseArgs = (argv) => {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    if (token.startsWith('--no-')) {
      const key = token.slice(5);
      result[key] = false;
      continue;
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex > -1) {
      const key = token.slice(2, eqIndex);
      const value = token.slice(eqIndex + 1);
      result[key] = value;
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

const run = (command, args, options = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  child.on('exit', (code) => {
    process.exit(typeof code === 'number' ? code : 1);
  });

  child.on('error', (error) => {
    console.error('[prompix] 启动失败:', error.message);
    process.exit(1);
  });
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const target = String(args.target || process.env.PROMPIX_TARGET || 'web').toLowerCase();

  if (target === 'web') {
    const host = String(args.host || process.env.PROMPIX_HOST || '127.0.0.1');
    const port = String(args.port || process.env.PROMPIX_PORT || '4173');
    const open = args.open !== false;

    const viteArgs = ['vite', '--host', host, '--port', port, '--strictPort'];
    if (open) viteArgs.push('--open');

    console.log(`[prompix] 启动 Web 开发环境 -> http://${host}:${port}`);
    run('npx', viteArgs);
    return;
  }

  if (target === 'weapp' || target === 'wechat') {
    const miniappDir = path.join(process.cwd(), 'miniapp');
    const miniappPkg = path.join(miniappDir, 'package.json');

    if (!existsSync(miniappPkg)) {
      console.error('[prompix] 微信小程序工程尚未初始化（缺少 miniapp/package.json）。');
      console.error('[prompix] 下一步：先在 miniapp/ 接入 Taro 或 uni-app 工程，再执行 npm run start:weapp。');
      process.exit(1);
    }

    const mode = String(args.mode || 'dev').toLowerCase();
    const scriptName = mode === 'build' ? 'build' : 'dev';

    console.log(`[prompix] 启动微信小程序 ${scriptName} 模式 -> miniapp/`);
    run('npm', ['run', scriptName], { cwd: miniappDir });
    return;
  }

  console.error(`[prompix] 不支持的 target: ${target}`);
  console.error('[prompix] 可用值: web | weapp');
  process.exit(1);
};

main();
