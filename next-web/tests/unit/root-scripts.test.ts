import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root startup script mapping', () => {
  it('maps default start to stable launcher and keeps legacy web fallback', () => {
    const rootPkgPath = path.resolve(process.cwd(), '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts || {};

    expect(scripts.dev).toBe('npm run start:dev');
    expect(scripts.start).toBe('node ./scripts/launch-prompix.mjs --mode=stable');
    expect(scripts['start:dev']).toBe('node ./scripts/launch-prompix.mjs --mode=dev');
    expect(scripts.stop).toBe('node ./scripts/stop-prompix.mjs');
    expect(scripts.build).toBe('npm --prefix ./next-web run build');
  });
});
