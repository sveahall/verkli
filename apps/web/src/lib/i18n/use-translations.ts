'use client';

import { useEffect, useMemo, useState } from 'react';

import { getLocale, type Locale } from './index';

type Dictionary = Record<string, string>;

const dictionaryCache = new Map<Locale, Dictionary>();
const interpolationPattern = /\{(\w+)\}/g;

async function loadDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === 'en') {
    return (await import('./dictionaries/en.json')).default;
  }
  return (await import('./dictionaries/sv.json')).default;
}

export function useT(): (key: string, vars?: Record<string, string>) => string {
  const [locale] = useState<Locale>(() => getLocale());
  const [loadedDictionary, setLoadedDictionary] = useState<Dictionary | null>(
    () => dictionaryCache.get(locale) ?? null
  );

  const dictionary = useMemo(
    () => dictionaryCache.get(locale) ?? loadedDictionary ?? {},
    [locale, loadedDictionary]
  );

  useEffect(() => {
    let active = true;

    if (dictionaryCache.has(locale)) {
      return () => {
        active = false;
      };
    }

    void loadDictionary(locale)
      .then((loadedDictionary) => {
        dictionaryCache.set(locale, loadedDictionary);
        if (active) {
          setLoadedDictionary(loadedDictionary);
        }
      })
      .catch(() => {
        if (active) {
          setLoadedDictionary({});
        }
      });

    return () => {
      active = false;
    };
  }, [locale]);

  return useMemo(() => {
    return (key: string, vars?: Record<string, string>): string => {
      const template = dictionary[key] ?? key;

      if (!vars) {
        return template;
      }

      return template.replace(interpolationPattern, (_, token: string) => vars[token] ?? `{${token}}`);
    };
  }, [dictionary]);
}
