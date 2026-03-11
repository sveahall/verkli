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
  CHAPTER_NOT_PUBLISHED: "Kapitlet är inte publicerat.",

  // Audiobook
  AUDIOBOOK_FEATURE_DISABLED: "Ljudboksfunktionen är inte aktiverad.",
  AUDIOBOOK_STATUS_UNAVAILABLE: "Ljudboksstatus är inte tillgänglig.",
  AUDIOBOOK_NO_ACTIVE_JOB: "Det finns ingen aktiv ljudboksgenerering att styra.",
  AUDIO_SIGN_FAILED: "Kunde inte skapa länk till ljudfilen. Försök igen.",
  AUDIO_PATH_INVALID: "Ljudfilen har en ogiltig sökväg.",
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
  TRANSLATION_PAIR_UNSUPPORTED: "Språkparet stöds inte av översättningsmodellen.",
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
  INVALID_BILLING_PLAN: "Ogiltig abonnemangsplan.",
  BILLING_CONFIG_MISSING: "Betalningskonfiguration saknas.",
  BILLING_CHECKOUT_FAILED: "Kunde inte starta abonnemangskassan.",
  BILLING_PORTAL_FAILED: "Kunde inte öppna abonnemangsportalen.",
  PRO_SUBSCRIPTION_REQUIRED: "Pro-abonnemang krävs för denna funktion.",
  PLUS_SUBSCRIPTION_REQUIRED: "Plus-abonnemang krävs för offline-läsning.",
  SUBSCRIPTION_PAST_DUE: "Din betalning är försenad. Uppdatera abonnemanget för att fortsätta.",

  // Offline reading
  OFFLINE_FEATURE_DISABLED: "Offline-läsning är inte aktiverad just nu.",
  OFFLINE_MANIFEST_LOAD_FAILED: "Kunde inte hämta offline-manifestet.",
  OFFLINE_CHAPTER_LOAD_FAILED: "Kunde inte hämta kapitel för offline-läsning.",

  // Jobs
  JOB_FETCH_FAILED: "Kunde inte hämta jobbstatus.",

  // TTS Preview
  TTS_PREVIEW_JOB_NOT_FOUND: "TTS-förhandsgranskningen hittades inte.",
  TTS_PREVIEW_INVALID_INPUT: "Ogiltig text eller parametrar. Max 500 tecken.",
  TTS_PREVIEW_INVALID_VOICE: "Ogiltig röst. Välj en röst från listan.",

  // Bookmarks
  BOOKMARK_LOAD_FAILED: "Kunde inte ladda bokmärken.",
  ALREADY_BOOKMARKED: "Redan bokmärkt.",
  BOOKMARK_ADD_FAILED: "Kunde inte lägga till bokmärke.",
  BOOKMARK_REMOVE_FAILED: "Kunde inte ta bort bokmärke.",
  INVALID_BOOK_ID: "Ogiltigt bok-ID.",

  // Reviews
  REVIEWS_LOAD_FAILED: "Kunde inte ladda recensioner.",
  REVIEW_SUBMIT_FAILED: "Kunde inte skicka recensionen.",
  REVIEW_UPDATE_FAILED: "Kunde inte uppdatera recensionen.",
  REVIEW_AGGREGATE_FAILED: "Kunde inte hämta betygssammanfattning.",
  ALREADY_REVIEWED: "Du har redan betygsatt den här boken.",
  REVIEW_NOT_FOUND: "Recensionen hittades inte.",

  // Comments
  COMMENT_LOAD_FAILED: "Kunde inte ladda kommentarer.",
  COMMENT_CREATE_FAILED: "Kunde inte skapa kommentaren.",
  COMMENT_DELETE_FAILED: "Kunde inte radera kommentaren.",
  COMMENT_NOT_FOUND: "Kommentaren hittades inte.",
  INVALID_COMMENT_ID: "Ogiltigt kommentar-ID.",
  COMMENT_PARENT_NOT_FOUND: "Svarskommentaren hittades inte.",
  COMMENT_THREAD_DEPTH_EXCEEDED: "Endast ett svarsled stöds just nu.",
  COMMENT_PARENT_MISMATCH: "Kommentaren kan inte svara i den här tråden.",
  INVALID_CHAPTER_ID: "Ogiltigt kapitel-ID.",

  // Follows
  FOLLOW_LIST_FAILED: "Kunde inte ladda följerelationer.",
  FOLLOW_CREATE_FAILED: "Kunde inte följa användaren.",
  FOLLOW_REMOVE_FAILED: "Kunde inte sluta följa användaren.",
  INVALID_FOLLOWEE_ID: "Ogiltigt användar-ID att följa.",
  CANNOT_FOLLOW_SELF: "Du kan inte följa dig själv.",
  ALREADY_FOLLOWING: "Du följer redan den här användaren.",

  // Notifications
  NOTIFICATION_LOAD_FAILED: "Kunde inte ladda notiser.",
  NOTIFICATION_NOT_FOUND: "Notisen hittades inte.",
  NOTIFICATION_UPDATE_FAILED: "Kunde inte uppdatera notisen.",

  // Direct messages
  MESSAGE_LIST_FAILED: "Kunde inte ladda inkorgen.",
  MESSAGE_CONVERSATION_CREATE_FAILED: "Kunde inte starta konversationen.",
  MESSAGE_SEND_FAILED: "Kunde inte skicka meddelandet.",
  MESSAGE_CONVERSATION_NOT_FOUND: "Konversationen hittades inte.",
  MESSAGE_REQUEST_ACCEPT_FAILED: "Kunde inte acceptera förfrågan.",
  MESSAGE_BLOCK_FAILED: "Kunde inte blockera användaren.",
  MESSAGE_BLOCKED: "Meddelanden är blockerade mellan dessa användare.",
  MESSAGE_INVALID_RECIPIENT: "Ogiltig mottagare för meddelandet.",

  // Feedback
  FEEDBACK_LOAD_FAILED: "Kunde inte ladda feedback.",
  FEEDBACK_SAVE_FAILED: "Kunde inte spara feedback.",

  // Auth
  INVALID_ROLE: "Ogiltig roll.",

  // Marketing
  MARKETING_FEATURE_DISABLED: "Marknadsföringsfunktionen är inte aktiverad.",

  // Social
  SOCIAL_FEATURE_DISABLED: "Social publicering är inte aktiverad.",
  SOCIAL_INVALID_PLATFORM: "Ogiltig plattform.",
  SOCIAL_ALREADY_CONNECTED: "Plattformen är redan ansluten.",
  SOCIAL_PLATFORM_NOT_CONNECTED: "Plattformen är inte ansluten.",
  SOCIAL_OAUTH_FAILED: "Inloggning till plattformen misslyckades.",
  SOCIAL_INVALID_STATE: "Ogiltig autentiseringsdata. Försök igen.",
  SOCIAL_CAMPAIGN_NOT_FOUND: "Kampanjen hittades inte.",

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
  COVER_GENERATION_FAILED: "Kunde inte generera omslagsförslag.",
  CONTENT_GENERATION_FAILED: "Innehållsgenereringen misslyckades.",
  CONTENT_INVALID_CHANNEL_TYPE: "Innehållstypen stöds inte för den valda kanalen.",
  CONTENT_FETCH_FAILED: "Kunde inte hämta genererat innehåll.",
  TRAILER_GENERATION_FAILED: "Kunde inte generera trailerunderlag.",
  TRAILER_LIMIT_REACHED: "Du har nått din trailergräns för denna månad.",

  // Book clubs
  CLUBS_FEATURE_DISABLED: "Bokklubbar är inte aktiverade.",
  CLUB_CREATE_FAILED: "Kunde inte skapa bokklubben.",
  CLUB_NOT_FOUND: "Bokklubben hittades inte.",
  CLUB_UPDATE_FAILED: "Kunde inte uppdatera bokklubben.",
  CLUB_DELETE_FAILED: "Kunde inte ta bort bokklubben.",
  CLUB_FULL: "Bokklubben är full.",
  CLUB_ALREADY_MEMBER: "Du är redan medlem i bokklubben.",
  CLUB_NOT_MEMBER: "Du är inte medlem i bokklubben.",
  CLUB_OWNER_CANNOT_LEAVE: "Ägaren kan inte lämna bokklubben.",
  CLUB_MESSAGE_FAILED: "Kunde inte skicka meddelandet till bokklubben.",
  CLUB_MESSAGES_LOAD_FAILED: "Kunde inte ladda bokklubbens meddelanden.",

  // Genres
  GENRES_LOAD_FAILED: "Kunde inte ladda genrer.",

  // Onboarding
  ONBOARDING_SAVE_FAILED: "Kunde inte spara onboarding.",

  // Polls
  POLLS_FEATURE_DISABLED: "Omröstningar är inte aktiverade.",
  POLL_NOT_FOUND: "Omröstningen hittades inte.",
  POLL_CREATE_FAILED: "Kunde inte skapa omröstningen.",
  POLL_CLOSED: "Omröstningen är stängd.",
  POLL_ALREADY_VOTED: "Du har redan röstat i omröstningen.",
  POLL_INVALID_OPTION: "Ogiltigt svarsalternativ.",
  POLL_RESULTS_LOAD_FAILED: "Kunde inte ladda omröstningsresultat.",

  // Newsletters
  NEWSLETTERS_FEATURE_DISABLED: "Nyhetsbrev är inte aktiverade.",
  NEWSLETTER_NOT_FOUND: "Nyhetsbrevet hittades inte.",
  NEWSLETTER_CREATE_FAILED: "Kunde inte skapa nyhetsbrevet.",
  NEWSLETTER_UPDATE_FAILED: "Kunde inte uppdatera nyhetsbrevet.",
  NEWSLETTER_SEND_FAILED: "Kunde inte skicka nyhetsbrevet.",
  NEWSLETTER_ALREADY_SENT: "Nyhetsbrevet har redan skickats.",
  NEWSLETTER_ALREADY_SUBSCRIBED: "Du prenumererar redan på detta nyhetsbrev.",
  NEWSLETTER_SUBSCRIBE_FAILED: "Kunde inte starta prenumerationen.",
  NEWSLETTER_SUBSCRIBERS_LOAD_FAILED: "Kunde inte ladda prenumeranter.",

  // Recommendations
  RECOMMENDATIONS_LOAD_FAILED: "Kunde inte ladda rekommendationer.",

  // Translation UI
  TRANSLATION_LIST_FAILED: "Kunde inte ladda översättningslistan.",
  TRANSLATION_STATUS_FAILED: "Kunde inte ladda översättningsstatus.",
  TRANSLATION_CHECKOUT_FAILED: "Kunde inte starta betalning för översättning. Försök igen.",

  // Dev
  NOT_AVAILABLE_IN_PRODUCTION: "Inte tillgängligt i produktion.",

  // Credits
  CREDITS_LOAD_FAILED: "Kunde inte ladda krediter. Försök igen.",

  // Donation
  DONATION_CHECKOUT_FAILED: "Kunde inte starta donationen. Försök igen.",
  INVALID_DONATION_AMOUNT: "Ange ett giltigt belopp.",

  // Referrals
  REFERRAL_GENERATE_FAILED: "Kunde inte skapa referenskod. Försök igen.",
  REFERRAL_REDEEM_FAILED: "Kunde inte lösa in koden. Försök igen.",
  REFERRAL_CODE_INVALID: "Ogiltig eller utgången referenskod.",
  REFERRAL_ALREADY_REDEEMED: "Du har redan löst in en referenskod.",
  REFERRAL_CANNOT_USE_OWN: "Du kan inte använda din egen referenskod.",
  INVALID_REFERRAL_CODE: "Ange en giltig referenskod.",

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
