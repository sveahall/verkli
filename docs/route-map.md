# Route Map (IA)

Last updated: 2026-03-04

## Reader (App)
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/reader/home` | Canonical landing after login: continue reading + recommended books + quick paths to browse. | Browse discover | Reader | Top nav: Home, Mobile tab | Canonical |
| `/reader/feed` | Legacy feed entry point (duplicated intent with Home). | — | Reader | None | Redirect → `/reader/home` |
| `/reader/discover` | Browse and discover books, lists, and authors. | Open book / View list | Reader | Top nav: Discover (dropdown) | Canonical |
| `/reader/genres` | Curated genres and collections. | Open list | Reader | Discover dropdown | Canonical |
| `/reader/authors` | Browse public author profiles. | Open author | Reader | Discover dropdown | Canonical |
| `/reader/books/[id]` | Book detail (start/continue reading, add bookmark). | Start reading | Reader | In-page only | Canonical |
| `/reader/read/[chapterId]` | Immersive reading view. | Continue reading | Reader | In-page only | Canonical |
| `/reader/lists/[slug]` | Curated list / collection view. | Open book | Reader | In-page only | Canonical |
| `/reader/authors/[id]` | Author profile and catalog. | Follow / Open book | Reader | In-page only | Canonical |
| `/reader/writers/[id]` | Legacy author profile route. | — | Reader | None | Redirect → `/reader/authors/[id]` |
| `/reader/library` | Your library (owned/saved books). | Open book | Reader | Top nav: Library (dropdown) | Canonical |
| `/reader/bookmarks` | Saved for later. | Open book | Reader | Library dropdown, Mobile tab “Saved” | Canonical |
| `/reader/profile` | Reader profile. | Edit profile | Reader | User menu | Canonical |
| `/reader/settings` | Reader settings. | Save settings | Reader | User menu | Canonical |
| `/reader/clubs` | Book clubs. | Join club | Reader | Top nav | Canonical |
| `/reader/clubs/[id]` | Club detail. | Join discussion | Reader | In-page only | Canonical |
| `/reader/polls` | Active polls. | Vote | Reader | In-page only | Canonical |
| `/reader/inbox` | Reader messages. | Reply | Reader | User menu | Canonical |
| `/reader/notifications` | Notifications feed. | Mark read | Reader | User menu | Canonical |
| `/reader/billing` | Reader billing/membership. | Manage plan | Reader | User menu | Canonical |
| `/reader/onboarding` | Reader onboarding flow. | Complete setup | Reader | After signup | Canonical |

## Author (App)
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/author/home` | Canonical author home (dashboard + shelves/books overview). | Create book | Author | Top nav: My World | Canonical |
| `/author/dashboard` | Legacy dashboard entry point. | — | Author | None | Redirect → `/author/home` |
| `/writer/home` | Legacy writer entry point. | — | Author | None | Redirect → `/author/home` |
| `/author/books` | Books list + create book. | Create book | Author | Top nav: Books | Canonical |
| `/author/books/[id]` | Book editor with chapters, cover, translate, publish. | Save / Publish | Author | In-page only | Canonical |
| `/author/shelves/[id]` | Shelf detail + curation. | Edit shelf | Author | In-page only | Canonical |
| `/author/library/[id]` | Library detail view. | Open book | Author | In-page only | Canonical |
| `/author/stats` | Performance and reader stats. | View stats | Author | My World dropdown | Canonical |
| `/author/profile` | Public author profile preview. | Edit profile | Author | My World dropdown + User menu | Canonical |
| `/author/settings` | Account settings. | Save settings | Author | User menu | Canonical |
| `/author/marketing` | Marketing tools (if enabled). | Create campaign | Author | Top nav / dropdown (when enabled) | Canonical |
| `/author/newsletters` | Newsletter management. | Create newsletter | Author | Top nav | Canonical |
| `/author/newsletters/[id]` | Newsletter detail/composer. | Send / Save | Author | In-page only | Canonical |
| `/author/polls` | Poll management. | Create poll | Author | Top nav | Canonical |
| `/author/inbox` | Author messages. | Reply | Author | User menu | Canonical |
| `/author/notifications` | Notifications feed. | Mark read | Author | User menu | Canonical |
| `/author/billing` | Author billing/subscription. | Manage plan | Author | User menu | Canonical |
| `/author/tts-lab` | Internal TTS testing page. | Generate audio | Author | Dev only | Canonical |
| `/account/feedback` | Feedback and issue reporting. | Send feedback | Author | In-page only | Canonical |

## Auth (Shared)
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/author/signin` | Author sign-in. | Sign in | Author | None | Canonical |
| `/author/signup` | Author sign-up. | Create account | Author | None | Canonical |
| `/author/forgot-password` | Author password reset. | Send reset link | Author | None | Canonical |
| `/reader/signin` | Reader sign-in. | Sign in | Reader | None | Canonical |
| `/reader/signup` | Reader sign-up. | Create account | Reader | None | Canonical |
| `/reader/forgot-password` | Reader password reset. | Send reset link | Reader | None | Canonical |
| `/signin` | Legacy generic sign-in. | — | — | None | Redirect → `/author/signin` |
| `/signup` | Legacy generic sign-up. | — | — | None | Redirect → `/author/signup` |
| `/forgot-password` | Legacy generic reset. | — | — | None | Redirect → `/author/forgot-password` |

## Public Reader
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/reader` | Reader marketing landing. | Join / Learn more | Public reader | Public top nav | Canonical |
| `/reader/app` | Reader app overview. | Get the app | Public reader | Public top nav | Canonical |
| `/reader/how-it-works` | Reader onboarding explainer. | Join | Public reader | Public top nav | Canonical |
| `/reader/membership` | Membership page. | Start membership | Public reader | Public top nav | Canonical |
| `/reader/faq` | Reader FAQ. | Contact support | Public reader | Public top nav | Canonical |

## Public Author
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/author` | Author marketing landing. | Start free | Public author | Public top nav | Canonical |
| `/product` | Product overview. | Start free | Public author | Public top nav | Canonical |
| `/how-it-works` | Author onboarding explainer. | Start free | Public author | Public top nav | Canonical |
| `/pricing` | Pricing page. | Start free | Public author | Public top nav | Canonical |
| `/faq` | Author FAQ. | Contact support | Public author | Public top nav | Canonical |

## Misc
| Route | Purpose | Primary CTA | Audience | Nav placement | Canonical / Redirect |
| --- | --- | --- | --- | --- | --- |
| `/waitlist` | Waitlist collection. | Join waitlist | Public | None | Canonical |
| `/` | Role selector + auto-redirect to last role. | Pick role | Public / Authenticated | None | Canonical |
