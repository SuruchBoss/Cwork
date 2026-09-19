import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

/** Thai is the product's first language; English is the alternate (CW-016). */
export type Language = 'th' | 'en';

interface UiState {
  theme: Theme;
  language: Language;
  /**
   * True once the person has picked a language themselves. A server-provided
   * locale seeds the default, but must never overwrite a deliberate choice on
   * the next sign-in.
   */
  languageExplicit: boolean;
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  /** Adopt the account's locale unless the person has already chosen. */
  syncLanguageFromLocale: (locale: string | null | undefined) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      language: 'th',
      languageExplicit: false,
      sidebarOpen: false,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setLanguage: (language) => {
        set({ language, languageExplicit: true });
        applyLocale(language);
      },
      syncLanguageFromLocale: (locale) => {
        if (get().languageExplicit) return;
        const language = localeToLanguage(locale);
        set({ language });
        applyLocale(language);
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
    }),
    {
      name: 'cwork.ui',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        languageExplicit: state.languageExplicit,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyLocale(state.language);
        }
      },
    },
  ),
);

/** Maps a BCP-47 locale (e.g. `en`, `en-US`, `th-TH`) to a supported language. */
export function localeToLanguage(locale: string | null | undefined): Language {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'th';
}

/**
 * 'system' removes the attribute entirely so `prefers-color-scheme` takes over;
 * an explicit choice stamps the root element and overrides the media query.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

/** Keeps the document language in sync so assistive tech announces it correctly. */
function applyLocale(language: Language): void {
  document.documentElement.lang = language;
}
