/**
 * Maps API error keys to Swedish UI messages.
 * The backend returns machine-readable keys (e.g. "BOOK_NOT_FOUND").
 * This module resolves them to user-friendly Swedish text.
 */

const ERROR_MESSAGES: Record<string, string> = {
  // Common
  UNAUTHORIZED: "Du måste vara inloggad.",
  FORBIDDEN: "Åtkomst nekad.",
  NOT_AUTHENTICATED: "Du måste vara inloggad.",
  INVALID_JSON: "Ogiltigt format.",
  INVALID_REQUEST_BODY: "Ogiltig förfrågan.",
  DATABASE_ERROR: "Ett databasfel uppstod. Försök igen.",
  GENERIC_ERROR: "Något gick fel. Försök igen.",
  VALIDATION_FAILED: "Valideringsfel. Kontrollera fälten.",

  // Books
  BOOK_NOT_FOUND: "Boken hittades inte.",
  BOOK_SETTINGS_LOAD_FAILED: "Kunde inte ladda bokinställningar.",
  BOOK_SETTINGS_UPDATE_FAILED: "Kunde inte uppdatera bokinställningar.",
  INVALID_BOOK_PRICING: "Ogiltig prisinformation.",
  BOOK_CREATION_INCOMPLETE: "Boken skapades men något gick fel.",
  VERSION_CREATION_FAILED: "Kunde inte skapa bokversion.",
  DEFAULT_CHAPTER_CREATION_FAILED: "Kunde inte skapa standardkapitel.",

  // Publishing
  NO_BOOK_VERSION_TO_PUBLISH: "Boken har ingen version att publicera.",
  INVALID_BOOK_VERSION: "Ogiltig bokversion.",
  MISSING_VISIBILITY_SETTING: "Synlighetsinställning saknas.",
  MISSING_BOOK_TITLE: "Boken måste ha en titel för att publiceras.",
  NO_CHAPTERS: "Boken måste ha minst ett kapitel.",
  CHAPTER_NEEDS_CONTENT: "Minst ett kapitel måste ha innehåll.",
  MISSING_COVER_IMAGE: "Boken måste ha en omslagsbild.",

  // Audiobook
  AUDIOBOOK_FEATURE_DISABLED: "Ljudboksfunktionen är inte aktiverad.",
  AUDIOBOOK_STATUS_UNAVAILABLE: "Ljudboksstatus är inte tillgänglig.",
  JOB_CREATION_FAILED: "Kunde inte skapa jobbet.",
  QUEUE_UNAVAILABLE: "Jobbkön är inte tillgänglig. Försök igen senare.",
  BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE: "Ingen version hittades för det angivna språket.",
  NO_CHAPTERS_FOR_VERSION: "Inga kapitel hittades för denna version.",

  // Translation
  TRANSLATION_FEATURE_DISABLED: "Översättningsfunktionen är inte aktiverad.",
  INVALID_TARGET_LANGUAGE: "Ogiltigt målspråk.",
  NO_SOURCE_VERSION: "Ingen källversion hittades.",
  INVALID_SOURCE_VERSION: "Ogiltig källversion.",
  SOURCE_LANGUAGE_MISSING: "Källspråk saknas. Ange språk för versionen.",
  SAME_SOURCE_TARGET_LANGUAGE: "Målspråket måste skilja sig från källspråket.",
  VERSION_ALREADY_EXISTS: "En version på det språket finns redan.",
  TRANSLATION_SERVICE_UNAVAILABLE: "Översättningstjänsten är inte tillgänglig. Försök igen.",

  // Import
  INVALID_MULTIPART_BODY: "Ogiltig filuppladdning.",
  MISSING_FILE: "Fil saknas.",
  INVALID_IMPORT_MODE: "Ogiltigt importläge.",
  IMPORT_RECORD_CREATION_FAILED: "Kunde inte skapa importpost.",
  IMPORT_FILE_STORAGE_FAILED: "Kunde inte spara importfilen.",
  IMPORT_NOT_FOUND: "Importen hittades inte.",
  IMPORT_NOT_FAILED: "Endast misslyckade importjobb kan köras igen.",
  IMPORT_MISSING_FILE_INFO: "Importen saknar filinformation och kan inte köras igen.",

  // Purchase
  AUTHOR_CANNOT_BUY_OWN_BOOK: "Du kan inte köpa din egen bok.",
  BOOK_IS_FREE: "Boken är gratis.",
  ALREADY_UNLOCKED: "Du har redan tillgång till denna bok.",
  CHECKOUT_START_FAILED: "Kunde inte starta betalning.",
  CHECKOUT_SESSION_FAILED: "Betalningssessionen misslyckades.",

  // Jobs
  JOB_FETCH_FAILED: "Kunde inte hämta jobbstatus.",

  // TTS
  TTS_DISABLED: "Talsyntes är inte aktiverad.",
  TTS_BUSY: "Talsyntesen är upptagen. Försök igen.",
  TTS_SYNTHESIS_FAILED: "Talsyntesen misslyckades.",
  TTS_UNEXPECTED_ERROR: "Oväntat talsyntesfel.",
  BUCKET_NOT_FOUND: "Lagringsutrymmet hittades inte.",
  AUDIO_URL_GENERATION_FAILED: "Kunde inte generera ljud-URL.",
  NO_TEXT_IN_CHAPTERS: "Inga kapitel har textinnehåll att syntetisera.",
  TTS_ENV_CONFIG_ERROR: "TTS-konfigurationsfel.",

  // Bookmarks
  BOOKMARK_LOAD_FAILED: "Kunde inte ladda bokmärken.",
  ALREADY_BOOKMARKED: "Redan bokmärkt.",
  BOOKMARK_ADD_FAILED: "Kunde inte lägga till bokmärke.",
  BOOKMARK_REMOVE_FAILED: "Kunde inte ta bort bokmärke.",
  INVALID_BOOK_ID: "Ogiltigt bok-ID.",

  // Feedback
  FEEDBACK_LOAD_FAILED: "Kunde inte ladda feedback.",
  FEEDBACK_SAVE_FAILED: "Kunde inte spara feedback.",

  // Auth
  INVALID_ROLE: "Ogiltig roll.",

  // Marketing
  MARKETING_FEATURE_DISABLED: "Marknadsföringsfunktionen är inte aktiverad.",

  // Waitlist
  SERVER_CONFIG_ERROR: "Serverfel. Försök igen senare.",
  RATE_LIMIT_EXCEEDED: "För många förfrågningar. Vänta en stund.",
  INVALID_EMAIL: "Ange en giltig e-postadress.",
  SIGNUP_VERIFICATION_FAILED: "Kunde inte verifiera din registrering. Försök igen.",
  WAITLIST_ADD_FAILED: "Kunde inte lägga till dig på väntelistan. Försök igen.",

  // Admin
  APPLICATIONS_LOAD_FAILED: "Kunde inte ladda ansökningar.",
  USER_ID_REQUIRED: "Användar-ID krävs.",
  INVALID_STATUS_VALUE: "Ogiltigt statusvärde.",
  APPLICATION_UPDATE_FAILED: "Kunde inte uppdatera ansökan.",
  APPLICATION_SUBMIT_FAILED: "Kunde inte skicka ansökan.",
  APPLICATION_CREATION_FAILED: "Kunde inte skapa ansökan.",
  FUNNEL_DATA_LOAD_FAILED: "Kunde inte ladda trattdata.",

  // AI
  PROMPT_TEXT_REQUIRED: "Prompttext krävs.",
  TEXT_TO_VIDEO_FAILED: "Text-till-video misslyckades.",

  // Dev
  NOT_AVAILABLE_IN_PRODUCTION: "Inte tillgängligt i produktion.",

  // Pricing validation
  INVALID_PRICE_AMOUNT: "Ogiltigt prisbelopp.",
  INVALID_PRICE_CURRENCY: "Ogiltig valuta.",
  INVALID_PRICING_MODEL: "Ogiltig prismodell.",
  INVALID_IS_FREE: "Ogiltigt gratis-fält.",
  INVALID_PRICING_COMBINATION: "Ogiltig priskombination.",
  NO_UPDATABLE_FIELDS: "Inga uppdateringsbara fält angavs.",
  PAID_BOOK_REQUIRES_CURRENCY: "Betalda böcker kräver en giltig valuta.",
};

const DEFAULT_MESSAGE = "Något gick fel. Försök igen.";

/**
 * Resolve an API error key to a Swedish UI message.
 * Falls back to the default message if the key is unknown.
 */
export function resolveErrorMessage(
  key: string | null | undefined,
  fallback?: string
): string {
  if (!key) return fallback ?? DEFAULT_MESSAGE;
  return ERROR_MESSAGES[key] ?? fallback ?? DEFAULT_MESSAGE;
}
