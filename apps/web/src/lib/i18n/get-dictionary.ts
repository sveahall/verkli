import { DEFAULT_LOCALE, type Locale } from './index';

type Dictionary = Record<string, string>;

const dictionaryCache = new Map<Locale, Dictionary>();

async function loadDictionary(locale: Locale): Promise<Dictionary> {
  switch (locale) {
    case 'en':
      return (await import('./dictionaries/en.json')).default;
    case 'sv':
    default:
      return (await import('./dictionaries/sv.json')).default;
  }
}

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const normalizedLocale: Locale = locale === 'en' || locale === 'sv' ? locale : DEFAULT_LOCALE;

  const cached = dictionaryCache.get(normalizedLocale);
  if (cached) {
    return cached;
  }

  const dictionary = await loadDictionary(normalizedLocale);
  dictionaryCache.set(normalizedLocale, dictionary);
  return dictionary;
}
