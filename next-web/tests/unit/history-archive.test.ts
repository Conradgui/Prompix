import { describe, expect, it } from 'vitest';
import { HistoryItem } from '../../lib/types';
import {
  buildHistoryExportPayload,
  mergeHistoryWithDedupe,
  parseHistoryImportPayload,
} from '../../lib/utils/historyArchive';

const makeItem = (id: string, timestamp: number, subject = 'subject-a'): HistoryItem => ({
  id,
  timestamp,
  imageUrl: `data:image/png;base64,${id}`,
  read: true,
  isFavorite: false,
  chatHistory: [],
  analysis: {
    description: 'demo',
    structuredPrompts: {
      subject: { original: subject, translated: `${subject}-en` },
      environment: { original: 'env', translated: 'env-en' },
      composition: { original: 'comp', translated: 'comp-en' },
      lighting: { original: 'light', translated: 'light-en' },
      mood: { original: 'mood', translated: 'mood-en' },
      style: { original: 'style', translated: 'style-en' },
    },
  },
});

describe('history archive', () => {
  it('builds export payload with metadata', () => {
    const payload = buildHistoryExportPayload([makeItem('1', 1)]);
    expect(payload.version).toBe(1);
    expect(payload.exportedAt).toBeTypeOf('number');
    expect(payload.items).toHaveLength(1);
  });

  it('parses import payload from both object and array shape', () => {
    const fromObject = parseHistoryImportPayload(JSON.stringify({ items: [makeItem('1', 1)] }));
    const fromArray = parseHistoryImportPayload(JSON.stringify([makeItem('2', 2)]));

    expect(fromObject).toHaveLength(1);
    expect(fromArray).toHaveLength(1);
  });

  it('dedupes by content fingerprint and keeps the newer one', () => {
    const current = [makeItem('old', 100, 'same-subject')];
    const incoming = [
      makeItem('newer', 200, 'same-subject'),
      makeItem('new-item', 300, 'another-subject'),
    ];

    const result = mergeHistoryWithDedupe(current, incoming);

    expect(result.added).toBe(1);
    expect(result.merged).toHaveLength(2);
    expect(result.merged[0].id).toBe('new-item');
    expect(result.merged[1].id).toBe('newer');
  });
});
