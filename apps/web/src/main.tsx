import './styles/global.css';
// Applies the saved language and theme before anything is rendered.
import { useLanguage } from './lib/preferences';
import { ApiError, onMissingTranslation } from '@identity/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { TopBanners } from './components/banners/TopBanners';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './lib/auth';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Client errors (403, 404, validation) will not fix themselves: fail fast.
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
});

// Native-app feel: no browser context menu (long press, right click) outside form fields.
document.addEventListener('contextmenu', (event) => {
  if (!(event.target instanceof Element && event.target.closest('input, textarea, select'))) event.preventDefault();
});

if (import.meta.env.DEV) {
  // Lists the texts still missing from the French dictionary (window.__missingTranslations).
  const missing = new Set<string>();
  Object.assign(window, { __missingTranslations: missing });
  onMissingTranslation((_lang, text) => missing.add(text));
}

/** The whole app is rendered again when the language changes, so every text is translated anew. */
function App() {
  const language = useLanguage();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider key={language}>
        <ToastProvider>
          <RouterProvider router={router} />
          <TopBanners />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
