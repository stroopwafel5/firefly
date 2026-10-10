import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontFaceContext } from '../components/Text';
import { faceForLang } from '../fonts';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import type { TKey } from './en';
import { Lang, RTL_LANGS, isLang } from './localized';
import {
  Params,
  countryName,
  formatClock,
  formatDate,
  formatDateRange,
  formatDuration,
  formatPrice,
  translate,
  translatePlural,
} from './translate';

export * from './localized';
export type { TKey } from './en';

const STORAGE_KEY = 'firefly.lang';
const RELOAD_KEY = 'firefly.lang.reloaded';

export interface I18n {
  lang: Lang;
  isRTL: boolean;
  t: (key: TKey, params?: Params) => string;
  tp: (base: string, n: number, params?: Params) => string;
  date: (d: Date, opts?: Intl.DateTimeFormatOptions) => string;
  dateRange: (start: Date, end: Date) => string;
  price: (amount: number, currency?: string) => string;
  clock: (minutes: number) => string;
  duration: (minutes: number) => string;
  country: (code: string) => string;
  setLang: (lang: Lang) => Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

function deviceLang(): Lang {
  const code = Localization.getLocales()[0]?.languageCode ?? 'en';
  if (code === 'he' || code === 'iw') return 'he';
  if (code === 'ru') return 'ru';
  return 'en';
}

async function reloadApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    // In development builds expo-updates can't reload; DevSettings can.
    DevSettings.reload();
  }
}

/** Hebrew needs the native layout direction flipped, which only takes effect after a reload. */
async function applyDirection(lang: Lang): Promise<boolean> {
  const wantRTL = RTL_LANGS.includes(lang);
  if (I18nManager.isRTL === wantRTL) return false;
  I18nManager.allowRTL(wantRTL);
  I18nManager.forceRTL(wantRTL);
  return true;
}

export function I18nProvider({
  children,
  onLanguageChange,
}: {
  children: React.ReactNode;
  onLanguageChange?: (lang: Lang) => void;
}) {
  const [lang, setLangState] = useState<Lang | null>(null);

  useEffect(() => {
    (async () => {
      let stored: string | null = null;
      try {
        stored = await AsyncStorage.getItem(STORAGE_KEY);
      } catch {
        /* storage unavailable */
      }
      const initial = isLang(stored) ? stored : deviceLang();
      // Reload once to apply right-to-left; if the direction still didn't change, carry on
      // rather than reloading forever (which would leave the screen blank).
      let reloadedOnce = false;
      try {
        reloadedOnce = (await AsyncStorage.getItem(RELOAD_KEY)) === initial;
        await AsyncStorage.removeItem(RELOAD_KEY);
      } catch {
        /* ignore */
      }
      if (!reloadedOnce && (await applyDirection(initial))) {
        try {
          await AsyncStorage.setItem(RELOAD_KEY, initial);
        } catch {
          /* ignore */
        }
        await reloadApp();
        return;
      }
      setLangState(initial);
    })();
  }, []);

  const setLang = useCallback(
    async (next: Lang) => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      onLanguageChange?.(next);
      if (await applyDirection(next)) {
        await reloadApp();
        return;
      }
      setLangState(next);
    },
    [onLanguageChange],
  );

  const value = useMemo<I18n | null>(() => {
    if (!lang) return null;
    return {
      lang,
      isRTL: RTL_LANGS.includes(lang),
      t: (key, params) => translate(lang, key, params),
      tp: (base, n, params) => translatePlural(lang, base, n, params),
      date: (d, opts) => formatDate(lang, d, opts),
      dateRange: (s, e) => formatDateRange(lang, s, e),
      price: (amount, currency) => formatPrice(lang, amount, currency),
      clock: formatClock,
      duration: (m) => formatDuration(lang, m),
      country: (code) => countryName(lang, code),
      setLang,
    };
  }, [lang, setLang]);

  if (!value) return null; // splash screen stays up until the language is known
  return (
    <I18nContext.Provider value={value}>
      <FontFaceContext.Provider value={faceForLang(value.lang)}>{children}</FontFaceContext.Provider>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
