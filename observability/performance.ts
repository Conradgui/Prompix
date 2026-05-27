// Lightweight local performance tracker (no telemetry upload).

const marks = new Set<string>();

const safeMark = (name: string) => {
  try {
    performance.mark(name);
    marks.add(name);
  } catch {
    // no-op
  }
};

const safeMeasure = (name: string, start: string, end: string): number | null => {
  try {
    performance.measure(name, start, end);
    const list = performance.getEntriesByName(name, 'measure');
    const entry = list[list.length - 1];
    performance.clearMarks(start);
    performance.clearMarks(end);
    performance.clearMeasures(name);
    marks.delete(start);
    marks.delete(end);
    return entry ? Math.round(entry.duration) : null;
  } catch {
    return null;
  }
};

export const trackPerformance = {
  imageCompressionStart: () => safeMark('image-compression-start'),
  imageCompressionEnd: (_imageCount = 1) => {
    safeMark('image-compression-end');
    return safeMeasure('image-compression-duration', 'image-compression-start', 'image-compression-end');
  },
  analysisStart: () => safeMark('analysis-start'),
  analysisEnd: (_model: string, _provider: string) => {
    safeMark('analysis-end');
    return safeMeasure('analysis-duration', 'analysis-start', 'analysis-end');
  },
  dimensionRefreshStart: (dimension: string) => safeMark(`dimension-refresh-${dimension}-start`),
  dimensionRefreshEnd: (dimension: string, _model: string) => {
    safeMark(`dimension-refresh-${dimension}-end`);
    return safeMeasure(`dimension-refresh-${dimension}`, `dimension-refresh-${dimension}-start`, `dimension-refresh-${dimension}-end`);
  },
  chatMessageStart: () => safeMark('chat-message-start'),
  chatFirstToken: () => {
    safeMark('chat-first-token');
    return safeMeasure('chat-ttft', 'chat-message-start', 'chat-first-token');
  },
  chatMessageEnd: () => {
    safeMark('chat-message-end');
    return safeMeasure('chat-total-duration', 'chat-message-start', 'chat-message-end');
  },
  termExplainStart: () => safeMark('term-explain-start'),
  termExplainEnd: (_term: string) => {
    safeMark('term-explain-end');
    return safeMeasure('term-explain-duration', 'term-explain-start', 'term-explain-end');
  },
  searchStart: () => safeMark('search-start'),
  searchEnd: (_resultCount: number) => {
    safeMark('search-end');
    return safeMeasure('search-duration', 'search-start', 'search-end');
  },
};

export const reportPageLoadMetrics = () => {
  // local-only; no-op for upload
};
