import { describe, expect, it } from 'vitest';
import { calculateBestAspectRatio } from '../../lib/state/app-state';

describe('calculateBestAspectRatio', () => {
  it('handles invalid inputs gracefully by returning 1:1', () => {
    expect(calculateBestAspectRatio(0, 1080)).toBe('1:1');
    expect(calculateBestAspectRatio(1920, 0)).toBe('1:1');
    expect(calculateBestAspectRatio(-100, 1080)).toBe('1:1');
    expect(calculateBestAspectRatio(1920, -100)).toBe('1:1');
    expect(calculateBestAspectRatio(NaN, 1080)).toBe('1:1');
    expect(calculateBestAspectRatio(Infinity, 1080)).toBe('1:1');
  });

  it('correctly maps 16:9 landscape dimensions', () => {
    expect(calculateBestAspectRatio(1920, 1080)).toBe('16:9');
    expect(calculateBestAspectRatio(1280, 720)).toBe('16:9');
  });

  it('correctly maps 9:16 portrait dimensions', () => {
    expect(calculateBestAspectRatio(1080, 1920)).toBe('9:16');
    expect(calculateBestAspectRatio(720, 1280)).toBe('9:16');
  });

  it('correctly maps square 1:1 dimensions', () => {
    expect(calculateBestAspectRatio(1000, 1000)).toBe('1:1');
    expect(calculateBestAspectRatio(512, 512)).toBe('1:1');
  });

  it('correctly maps cinema 21:9 dimensions', () => {
    expect(calculateBestAspectRatio(2560, 1080)).toBe('21:9');
  });

  it('correctly maps standard photography ratios', () => {
    expect(calculateBestAspectRatio(3000, 2000)).toBe('3:2'); // 3:2 landscape
    expect(calculateBestAspectRatio(2000, 3000)).toBe('2:3'); // 2:3 portrait
    expect(calculateBestAspectRatio(1600, 1200)).toBe('4:3'); // 4:3 landscape
    expect(calculateBestAspectRatio(1200, 1600)).toBe('3:4'); // 3:4 portrait
  });

  it('handles near-ratio dimensions by rounding to the closest preset', () => {
    // 1920 / 1000 is 1.92, which is closest to 16:9 (1.777)
    expect(calculateBestAspectRatio(1920, 1000)).toBe('16:9');
    // 1000 / 1920 is 0.52, which is closest to 9:16 (0.56)
    expect(calculateBestAspectRatio(1000, 1920)).toBe('9:16');
  });
});
