export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  appName: import.meta.env.VITE_APP_NAME ?? 'MarMa HRIS',
  isDev: import.meta.env.DEV,
} as const;
