# Beta readiness candidate — 18 September 2026

This package closes specific beta blockers. It does not certify the complete
publisher, payment, physical-print or account-deletion journey.

## Changes and review

- Reviewed translations use one immutable queued run ID, an authoritative ledger,
  conservative provider reservations and an atomic database commit. Only the
  ledger winner reserves its captured plan. Ambiguous outcomes retain their
  reservation and require reconciliation; replay does not repeat model work.
- Invited authors can receive temporary Pro access when
  `BETA_AUTHOR_PRO_ENABLED=true`. The server requires both an authoritative
  author/admin profile and `user_flags.beta_enabled=true`. Stripe history stays
  unchanged. The account page identifies beta access; the editor no longer says
  access is locked when beta access is valid.
- Audiobook preview requests carry the selected edition. Invalid, foreign,
  missing or empty selected editions stop before generation. Changing the book
  or edition cancels the old request and clears its temporary audio.

Independent specification and quality reviews passed for translation source
`e9c4afaf`, beta access `d82716a3`, and audio `c1a929cd`. They were integrated in
that order into the release worktree. Review artifacts and exact command logs
are retained outside the repository under
`Documents/Verkli/Beta-readiness-2026-09-18/`.

## Applied database changes

The two migration files in this package were applied to production project
`glfipbnsyxowqsmcuzcm` through the managed Supabase CLI on 18 September. Each
transaction was rehearsed with rollback, applied with assertions and migration
history, then checked through a fresh read-only connection.

| Migration | Fresh verification |
| --- | --- |
| `20260918173000_s1_client_write_hardening.sql` | Protected profile writes and unsafe table privileges removed; safe owner operations, all 17 profiles and beta flags preserved; eight postconditions passed. |
| `20260918173100_commit_reviewed_translation.sql` | Exact 15-argument invoker function exists; only service-role execution is granted; canonical function body and migration history match. |

No existing manuscript was changed by either migration. These migrations keep
the approved proposal bodies verbatim; historical proposal comments do not
replace the applied evidence. Generated TypeScript types remain unchanged:
the management type-generation endpoint rejected the available account. A type
download from the authorized project account is still needed; an error response
was not copied into the application's types.

## Real integration evidence

- A new private two-chapter TXT import passed through the application API and
  deployed import worker. Chapter order and exact content were checked.
- Proofreading and whole-book analysis used four actual model calls, totaling
  8,761 input/output tokens. Seeded spelling and cross-chapter consistency issues
  were found. Original manuscripts stayed unchanged.
- One private EN-to-SV translation used seven model calls, totaling 15,054
  input/output tokens. The atomic commit saved two chapters. Replaying the same
  run made no additional provider or RPC calls and changed no budget or content.
  This was direct worker integration, not production queue consumption.
- Local CUA browser checks exercised sample review success, remaining issues and
  provider failure, plus English-to-Swedish audio edition switching, clearing
  the previous preview, playback of the local tone and the preview error state.
  These browser fixtures make no provider requests or manuscript writes.
- Two actual ElevenLabs previews subsequently returned HTTP 200 MP3 for the
  selected English and Swedish editions, with no manuscript changes. Both files
  decoded to nonsilent audio. This is a preview integration check, not human
  pronunciation approval or full-book generation. The existing provider still
  detects language from text; it does not send a `language_code` parameter.

Reservation units are conservative limits, not invoice amounts. The successful
model tests were bounded by local settings and the authorized QA allowance.
They do not prove a platform-wide weekly currency cap.

## Production release conditions

Railway web and four workers follow `platform`. Web waits for CI; workers do
not. Release translation with its queue paused and drained, keep the reviewed
flag closed until both web and worker run the verified candidate, then activate
and resume. Preserve legacy jobs for reconciliation; never bulk-retry them.

Production translation activation requires
`REVIEWED_TRANSLATION_ATOMIC_ENABLED=true` on web and translation worker.
Beta Pro is separately controlled by `BETA_AUTHOR_PRO_ENABLED`. Editorial work
requires an explicit positive `EDITORIAL_DAILY_BUDGET`; whole-book analysis also
requires `WHOLE_BOOK_ANALYSIS_ENABLED=true`. Configuration changes and exact
deployed SHA must be verified separately from source tests.

The live Stripe catalog and webhook event parity passed read-only checks.
Chapter RLS policy structure passed, but the existing paid-book behavioral
checker could not run because no published paid book exists. `BETA_LOCK=true`
is intentional for this invited beta, despite the public-launch checker
requiring it to be false. Marketing/social remain disabled and have no workers.
The green pipeline-smoke workflow skipped its actual test for absent secrets;
it must not be counted as end-to-end evidence.

## Still outside the completion claim

- SMTP sender configuration and the reported phishing warning need verification
  in the authenticated Supabase project account. Correct reset redirects alone
  do not prove email deliverability.
- A real authorized purchase, delivery, entitlement and refund journey, and the
  commercial royalty decision, remain open.
- Physical print fulfillment, external campaign delivery, and the complete
  account deletion worker are not certified by this package.
- `chapter-media` was public but empty at inspection. That observation does not
  make future objects private.

## Operator QA

1. In an invited author account, open billing and confirm “Verkli Pro · Beta”
   without a card requirement. Verify a noninvited account is not granted it.
2. Open a private test book with older English and newer Swedish editions.
   Preview each selected edition; switching must clear the previous audio.
3. Review a short translation sample, inspect the original alongside the result,
   and confirm failures never produce an approval badge.
4. Translate a short private book through the deployed queue, then reload and
   verify chapter order, saved review, source preservation and the same run ID.
5. Check all intended Railway services' release SHA, recent worker heartbeats
   and queue state. Record skipped, failed and unexecuted checks explicitly.

For provider-free local UI inspection, run the normal web development server
and open `/dev/translation-quality` and `/dev/audiobook-preview`. These routes
are unavailable in production.
