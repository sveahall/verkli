/**
 * Maps API error keys to UI messages.
 * The backend returns machine-readable keys (e.g. "BOOK_NOT_FOUND").
 * This module resolves them to user-friendly text.
 */

const ERROR_MESSAGES: Record<string, string> = {
  // Common
  UNAUTHORIZED: "You must be logged in.",
  FORBIDDEN: "Access denied.",
  NOT_AUTHENTICATED: "You must be logged in.",
  INVALID_JSON: "Invalid format.",
  INVALID_REQUEST_BODY: "Invalid request.",
  DATABASE_ERROR: "A database error occurred. Try again.",
  GENERIC_ERROR: "Something went wrong. Try again.",
  VALIDATION_FAILED: "Validation failed. Please check the fields.",

  // Books
  BOOK_NOT_FOUND: "Book not found.",
  BOOK_SETTINGS_LOAD_FAILED: "Failed to load book settings.",
  BOOK_SETTINGS_UPDATE_FAILED: "Failed to update book settings.",
  INVALID_BOOK_PRICING: "Invalid pricing information.",
  BOOK_CREATION_INCOMPLETE: "The book was created but something went wrong.",
  VERSION_CREATION_FAILED: "Failed to create book version.",
  DEFAULT_CHAPTER_CREATION_FAILED: "Failed to create the default chapter.",

  // Publishing
  NO_BOOK_VERSION_TO_PUBLISH: "The book has no version to publish.",
  INVALID_BOOK_VERSION: "Invalid book version.",
  MISSING_VISIBILITY_SETTING: "Visibility setting is missing.",
  MISSING_BOOK_TITLE: "The book must have a title before it can be published.",
  NO_CHAPTERS: "The book must have at least one chapter.",
  CHAPTER_NEEDS_CONTENT: "At least one chapter must have content.",
  MISSING_COVER_IMAGE: "The book must have a cover image.",
  CHAPTER_NOT_PUBLISHED: "The chapter is not published.",
  AUTHOR_DISPLAY_NAME_REQUIRED:
    "Add a display name in your author profile before publishing.",

  // Audiobook
  AUDIOBOOK_FEATURE_DISABLED: "The audiobook feature is not enabled.",
  AUDIOBOOK_STATUS_UNAVAILABLE: "Audiobook status is unavailable.",
  AUDIOBOOK_NO_ACTIVE_JOB: "There is no active audiobook generation to control.",
  AUDIO_SIGN_FAILED: "Failed to generate a link to the audio file. Try again.",
  AUDIO_PATH_INVALID: "The audio file has an invalid path.",
  JOB_CREATION_FAILED: "Failed to create the job.",
  QUEUE_UNAVAILABLE: "The job queue is unavailable. Try again later.",
  BOOK_VERSION_NOT_FOUND_FOR_LANGUAGE: "No version found for the specified language.",
  NO_CHAPTERS_FOR_VERSION: "No chapters found for this version.",

  // Translation
  TRANSLATION_FEATURE_DISABLED: "The translation feature is not enabled.",
  INVALID_TARGET_LANGUAGE: "Invalid target language.",
  NO_SOURCE_VERSION: "No source version found.",
  INVALID_SOURCE_VERSION: "Invalid source version.",
  SOURCE_LANGUAGE_MISSING: "Source language is missing. Please set a language for the version.",
  SAME_SOURCE_TARGET_LANGUAGE: "The target language must differ from the source language.",
  TRANSLATION_PAIR_UNSUPPORTED: "This language pair is not supported by the translation model.",
  VERSION_ALREADY_EXISTS: "A version in that language already exists.",
  TRANSLATION_SERVICE_UNAVAILABLE: "The translation service is unavailable. Try again.",

  // Import
  INVALID_MULTIPART_BODY: "Invalid file upload.",
  MISSING_FILE: "File is missing.",
  INVALID_IMPORT_MODE: "Invalid import mode.",
  IMPORT_RECORD_CREATION_FAILED: "Failed to create import record.",
  IMPORT_FILE_STORAGE_FAILED: "Failed to save the import file.",
  IMPORT_NOT_FOUND: "Import not found.",
  IMPORT_NOT_FAILED: "Only failed import jobs can be retried.",
  IMPORT_MISSING_FILE_INFO: "The import is missing file information and cannot be retried.",

  // Purchase
  AUTHOR_CANNOT_BUY_OWN_BOOK: "You cannot purchase your own book.",
  BOOK_IS_FREE: "This book is free.",
  ALREADY_UNLOCKED: "You already have access to this book.",
  CHECKOUT_START_FAILED: "Failed to start checkout.",
  CHECKOUT_SESSION_FAILED: "The checkout session failed.",
  INVALID_BILLING_PLAN: "Invalid subscription plan.",
  BILLING_CONFIG_MISSING: "Billing configuration is missing.",
  BILLING_CHECKOUT_FAILED: "Failed to start the subscription checkout.",
  BILLING_PORTAL_FAILED: "Failed to open the billing portal.",
  PRO_SUBSCRIPTION_REQUIRED: "A Pro subscription is required for this feature.",
  PLUS_SUBSCRIPTION_REQUIRED: "A Plus subscription is required for offline reading.",
  SUBSCRIPTION_PAST_DUE: "Your payment is overdue. Please update your subscription to continue.",

  // Offline reading
  OFFLINE_FEATURE_DISABLED: "Offline reading is not available right now.",
  OFFLINE_MANIFEST_LOAD_FAILED: "Failed to load the offline manifest.",
  OFFLINE_CHAPTER_LOAD_FAILED: "Failed to load chapters for offline reading.",

  // Jobs
  JOB_FETCH_FAILED: "Failed to fetch job status.",

  // TTS Preview
  TTS_PREVIEW_JOB_NOT_FOUND: "TTS preview not found.",
  TTS_PREVIEW_INVALID_INPUT: "Invalid text or parameters. Maximum 500 characters.",
  TTS_PREVIEW_INVALID_VOICE: "Invalid voice. Please select a voice from the list.",

  // Bookmarks
  BOOKMARK_LOAD_FAILED: "Failed to load bookmarks.",
  ALREADY_BOOKMARKED: "Already bookmarked.",
  BOOKMARK_ADD_FAILED: "Failed to add bookmark.",
  BOOKMARK_REMOVE_FAILED: "Failed to remove bookmark.",
  INVALID_BOOK_ID: "Invalid book ID.",

  // Reviews
  REVIEWS_LOAD_FAILED: "Failed to load reviews.",
  REVIEW_SUBMIT_FAILED: "Failed to submit review.",
  REVIEW_UPDATE_FAILED: "Failed to update review.",
  REVIEW_AGGREGATE_FAILED: "Failed to load rating summary.",
  ALREADY_REVIEWED: "You have already reviewed this book.",
  REVIEW_NOT_FOUND: "Review not found.",

  // Comments
  COMMENT_LOAD_FAILED: "Failed to load comments.",
  COMMENT_CREATE_FAILED: "Failed to create comment.",
  COMMENT_DELETE_FAILED: "Failed to delete comment.",
  COMMENT_NOT_FOUND: "Comment not found.",
  INVALID_COMMENT_ID: "Invalid comment ID.",
  COMMENT_PARENT_NOT_FOUND: "Parent comment not found.",
  COMMENT_THREAD_DEPTH_EXCEEDED: "Only one level of replies is supported right now.",
  COMMENT_PARENT_MISMATCH: "This comment cannot reply in this thread.",
  INVALID_CHAPTER_ID: "Invalid chapter ID.",

  // Follows
  FOLLOW_LIST_FAILED: "Failed to load follows.",
  FOLLOW_CREATE_FAILED: "Failed to follow user.",
  FOLLOW_REMOVE_FAILED: "Failed to unfollow user.",
  INVALID_FOLLOWEE_ID: "Invalid user ID to follow.",
  CANNOT_FOLLOW_SELF: "You cannot follow yourself.",
  ALREADY_FOLLOWING: "You are already following this user.",

  // Notifications
  NOTIFICATION_LOAD_FAILED: "Failed to load notifications.",
  NOTIFICATION_NOT_FOUND: "Notification not found.",
  NOTIFICATION_UPDATE_FAILED: "Failed to update notification.",

  // Direct messages
  MESSAGE_LIST_FAILED: "Failed to load inbox.",
  MESSAGE_CONVERSATION_CREATE_FAILED: "Failed to start conversation.",
  MESSAGE_SEND_FAILED: "Failed to send message.",
  MESSAGE_CONVERSATION_NOT_FOUND: "Conversation not found.",
  MESSAGE_REQUEST_ACCEPT_FAILED: "Failed to accept request.",
  MESSAGE_BLOCK_FAILED: "Failed to block user.",
  MESSAGE_BLOCKED: "Messages are blocked between these users.",
  MESSAGE_INVALID_RECIPIENT: "Invalid message recipient.",

  // Feedback
  FEEDBACK_LOAD_FAILED: "Failed to load feedback.",
  FEEDBACK_SAVE_FAILED: "Failed to save feedback.",

  // Auth
  INVALID_ROLE: "Invalid role.",

  // Marketing
  MARKETING_FEATURE_DISABLED: "The marketing feature is not enabled.",

  // Social
  SOCIAL_FEATURE_DISABLED: "Social publishing is not enabled.",
  SOCIAL_INVALID_PLATFORM: "Invalid platform.",
  SOCIAL_ALREADY_CONNECTED: "This platform is already connected.",
  SOCIAL_PLATFORM_NOT_CONNECTED: "This platform is not connected.",
  SOCIAL_OAUTH_FAILED: "Login to the platform failed.",
  SOCIAL_INVALID_STATE: "Invalid authentication data. Try again.",
  SOCIAL_CAMPAIGN_NOT_FOUND: "Campaign not found.",

  // Waitlist
  SERVER_CONFIG_ERROR: "Server error. Try again later.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please wait a moment.",
  INVALID_EMAIL: "Please enter a valid email address.",
  SIGNUP_VERIFICATION_FAILED: "Failed to verify your registration. Try again.",
  WAITLIST_ADD_FAILED: "Failed to add you to the waitlist. Try again.",

  // Admin
  APPLICATIONS_LOAD_FAILED: "Failed to load applications.",
  USER_ID_REQUIRED: "User ID is required.",
  INVALID_USER_ID: "Invalid user ID.",
  INVALID_STATUS_VALUE: "Invalid status value.",
  APPLICATION_UPDATE_FAILED: "Failed to update application.",
  APPLICATION_SUBMIT_FAILED: "Failed to submit application.",
  APPLICATION_CREATION_FAILED: "Failed to create application.",
  FUNNEL_DATA_LOAD_FAILED: "Failed to load funnel data.",

  // AI
  PROMPT_TEXT_REQUIRED: "Prompt text is required.",
  TEXT_TO_VIDEO_FAILED: "Text-to-video failed.",
  COVER_GENERATION_FAILED: "Failed to generate cover suggestions.",
  CONTENT_GENERATION_FAILED: "Content generation failed.",
  CONTENT_INVALID_CHANNEL_TYPE: "This content type is not supported for the selected channel.",
  CONTENT_FETCH_FAILED: "Failed to fetch generated content.",
  TRAILER_GENERATION_FAILED: "Failed to generate trailer assets.",
  TRAILER_LIMIT_REACHED: "You have reached your trailer limit for this month.",

  // Book clubs
  CLUBS_FEATURE_DISABLED: "Book clubs are not enabled.",
  CLUB_CREATE_FAILED: "Failed to create book club.",
  CLUB_NOT_FOUND: "Book club not found.",
  CLUB_UPDATE_FAILED: "Failed to update book club.",
  CLUB_DELETE_FAILED: "Failed to delete book club.",
  CLUB_FULL: "This book club is full.",
  CLUB_ALREADY_MEMBER: "You are already a member of this book club.",
  CLUB_NOT_MEMBER: "You are not a member of this book club.",
  CLUB_OWNER_CANNOT_LEAVE: "The owner cannot leave the book club.",
  CLUB_MESSAGE_FAILED: "Failed to send message to book club.",
  CLUB_MESSAGES_LOAD_FAILED: "Failed to load book club messages.",

  // Genres
  GENRES_LOAD_FAILED: "Failed to load genres.",

  // Onboarding
  ONBOARDING_SAVE_FAILED: "Failed to save onboarding.",

  // Polls
  POLLS_FEATURE_DISABLED: "Polls are not enabled.",
  POLL_NOT_FOUND: "Poll not found.",
  POLL_CREATE_FAILED: "Failed to create poll.",
  POLL_CLOSED: "This poll is closed.",
  POLL_ALREADY_VOTED: "You have already voted in this poll.",
  POLL_INVALID_OPTION: "Invalid poll option.",
  POLL_RESULTS_LOAD_FAILED: "Failed to load poll results.",

  // Newsletters
  NEWSLETTERS_FEATURE_DISABLED: "Newsletters are not enabled.",
  NEWSLETTER_NOT_FOUND: "Newsletter not found.",
  NEWSLETTER_CREATE_FAILED: "Failed to create newsletter.",
  NEWSLETTER_UPDATE_FAILED: "Failed to update newsletter.",
  NEWSLETTER_SEND_FAILED: "Failed to send newsletter.",
  NEWSLETTER_ALREADY_SENT: "This newsletter has already been sent.",
  NEWSLETTER_ALREADY_SUBSCRIBED: "You are already subscribed to this newsletter.",
  NEWSLETTER_SUBSCRIBE_FAILED: "Failed to start subscription.",
  NEWSLETTER_SUBSCRIBERS_LOAD_FAILED: "Failed to load subscribers.",

  // Recommendations
  RECOMMENDATIONS_LOAD_FAILED: "Failed to load recommendations.",

  // Translation UI
  TRANSLATION_LIST_FAILED: "Failed to load translation list.",
  TRANSLATION_STATUS_FAILED: "Failed to load translation status.",
  TRANSLATION_CHECKOUT_FAILED: "Failed to start payment for translation. Try again.",

  // Dev
  NOT_AVAILABLE_IN_PRODUCTION: "Not available in production.",

  // Credits
  CREDITS_LOAD_FAILED: "Failed to load credits. Try again.",

  // Donation
  DONATION_CHECKOUT_FAILED: "Failed to start donation. Try again.",
  INVALID_DONATION_AMOUNT: "Please enter a valid amount.",

  // Referrals
  REFERRAL_GENERATE_FAILED: "Failed to generate referral code. Try again.",
  REFERRAL_REDEEM_FAILED: "Failed to redeem code. Try again.",
  REFERRAL_CODE_INVALID: "Invalid or expired referral code.",
  REFERRAL_ALREADY_REDEEMED: "You have already redeemed a referral code.",
  REFERRAL_CANNOT_USE_OWN: "You cannot use your own referral code.",
  INVALID_REFERRAL_CODE: "Please enter a valid referral code.",

  // Print-on-demand
  POD_NOT_ENABLED: "Print-on-demand is not enabled for this book.",
  POD_FORMAT_UNAVAILABLE: "The selected print format is not available.",
  POD_PRICE_NOT_SET: "A price must be set before placing an order.",

  // Pricing validation
  INVALID_PRICE_AMOUNT: "Invalid price amount.",
  INVALID_PRICE_CURRENCY: "Invalid currency.",
  INVALID_PRICING_MODEL: "Invalid pricing model.",
  INVALID_IS_FREE: "Invalid free field.",
  INVALID_PRICING_COMBINATION: "Invalid pricing combination.",
  NO_UPDATABLE_FIELDS: "No updatable fields were provided.",
  PAID_BOOK_REQUIRES_CURRENCY: "Paid books require a valid currency.",
};

const DEFAULT_MESSAGE = "Something went wrong. Try again.";

/**
 * Resolve an API error key to a UI message.
 * Falls back to the default message if the key is unknown.
 */
export function resolveErrorMessage(
  key: string | null | undefined,
  fallback?: string
): string {
  if (!key) return fallback ?? DEFAULT_MESSAGE;
  return ERROR_MESSAGES[key] ?? fallback ?? DEFAULT_MESSAGE;
}
