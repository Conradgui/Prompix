import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('launch script guards', () => {
  it('contains stable/dev mode split and dist dir isolation', () => {
    const scriptPath = path.resolve(process.cwd(), '..', 'scripts', 'launch-prompix.mjs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    expect(content).toContain("name: 'stable'");
    expect(content).toContain("name: 'dev'");
    expect(content).toContain("distDir: '.next'");
    expect(content).toContain("distDir: '.next-dev'");
    expect(content).toContain('PROMPIX_NEXT_DIST_DIR');
  });

  it('checks html + stylesheet health before reporting success', () => {
    const scriptPath = path.resolve(process.cwd(), '..', 'scripts', 'launch-prompix.mjs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    expect(content).toContain('extractStylesheetUrl');
    expect(content).toContain("rel=[\"']stylesheet[\"']");
    expect(content).toContain("contentType.toLowerCase().includes('text/css')");
    expect(content).toContain('waitForHealthyServer');
  });
});
