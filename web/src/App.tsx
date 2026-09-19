import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/query-client';
import { router } from './app/router';
import { useAuthStore } from './stores/auth.store';
import { useUiStore } from './stores/ui.store';

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const userLocale = useAuthStore((s) => s.user?.locale);
  const theme = useUiStore((s) => s.theme);
  const syncLanguageFromLocale = useUiStore((s) => s.syncLanguageFromLocale);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Seed the language from the signed-in account's locale, unless the person
  // has already chosen one themselves (the store guards that).
  useEffect(() => {
    syncLanguageFromLocale(userLocale);
  }, [userLocale, syncLanguageFromLocale]);

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
