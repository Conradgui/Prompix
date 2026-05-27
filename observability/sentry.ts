// Observability disabled for Prompix (interview/demo mode).
// Keep no-op APIs to avoid touching business imports.

export const initSentry = () => {
  // no-op
};

export const trackError = (
  error: Error,
  context?: {
    model_name?: string;
    error_type?: string;
    api_status?: 'success' | 'error';
    image_count?: number;
    prompt_length?: number;
    provider?: string;
    http_status?: number;
    dimension?: string;
  }
) => {
  console.debug('[prompix][error]', error?.message, context || {});
};

export const trackApiStatus = (
  provider: string,
  model: string,
  status: 'success' | 'error',
  errorCode?: number | string
) => {
  console.debug('[prompix][api]', { provider, model, status, errorCode });
};

export const trackUserAction = (
  action: string,
  category: string,
  data?: Record<string, string | number | boolean>
) => {
  console.debug('[prompix][action]', { action, category, data });
};
