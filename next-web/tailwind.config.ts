import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ag: {
          bg: 'var(--ag-bg)',
          surface: 'var(--ag-surface)',
          text: 'var(--ag-text)',
          muted: 'var(--ag-muted)',
          border: 'var(--ag-border)',
          accent: 'var(--ag-accent)',
          accentLight: 'var(--ag-accent-light)'
        }
      },
      borderRadius: {
        ag: '20px'
      },
      boxShadow: {
        ag: '0 16px 40px -12px var(--ag-shadow)'
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: [],
};

export default config;
