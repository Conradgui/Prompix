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

    expect(scripts.start).toBe('npm run prompix:open');
    expect(scripts['start:dev']).toBe('npm run prompix:open:dev');
    expect(scripts['prompix:open']).toBe('node ./scripts/launch-prompix.mjs');
    expect(scripts['prompix:open:dev']).toBe('node ./scripts/launch-prompix.mjs --mode=dev');
    expect(scripts['legacy:web']).toBe('node ./scripts/start.mjs --target=web');
  });
});
