// Observability entrypoint (disabled external telemetry).

import { initSentry, trackError, trackApiStatus, trackUserAction } from './sentry';
import { trackPerformance, reportPageLoadMetrics } from './performance';

export const initObservability = () => {
  initSentry();
  reportPageLoadMetrics();
};

export { trackError, trackApiStatus, trackUserAction, trackPerformance };

export const withApiTracking = async <T>(
  apiCall: () => Promise<T>,
  _provider: string,
  _model: string
): Promise<T> => {
  try {
    return await apiCall();
  } catch (error) {
    throw error;
  }
};

export interface DesensitizedMetadata {
  image_count?: number;
  prompt_length?: number;
  model_name?: string;
  provider?: string;
  error_type?: string;
  api_status?: 'success' | 'error';
  http_status?: number;
  dimension?: string;
  action?: string;
}
