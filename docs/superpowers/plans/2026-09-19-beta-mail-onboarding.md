# Beta email onboarding implementation plan

**Goal:** An admin can select a beta tester, grant the correct access and send a clear welcome email once, while retaining Resend's free plan.

**Approved direction:** The user accepted the proposed waitlist → selected → login/setup → first steps flow and asked to complete it. Existing provider, dependencies, schema and public beta lock remain in place. No mailing-list blast or paid plan activation is included.

**Architecture:** Reuse Supabase waitlists, user_flags and author_applications for access. Use append-only audit_log entries with deterministic UUID primary keys to record immutable email attempts, provider acceptance and 20 daily invitation-attempt slots. Resend idempotency protects retries with the exact stored payload within 23 hours; older uncertain attempts require operator review. No schema changes. Daily limit is an invitation allowance, not a claim to know total Resend quota or inbox placement.

## Implementation

- [x] Templates and local preview: beta-invitation.ts supports new/existing author/reader, plaintext, exact-account instructions, helpful first steps and honest limits; waitlist-confirmation stays explicitly pending. Render the real templates at development-only /dev/beta-emails. Test escaping and CTA routing.
- [x] Delivery service: add lib/emails/beta-delivery.ts and tests. Store frozen from/to/subject/html/text before network request; accepted marker written after a nonempty provider ID. Duplicate calls replay safely; failed persistence never says sent. Missing config/database failure/quota failure send nothing. Daily reservations use unique audit UUIDs across processes. Retry outside provider's 24-hour key retention is blocked at 23 hours.
- [x] Access and invitation API: add admin-only /api/admin/beta-invitations GET/POST. Accept only server-loaded waitlist row IDs or existing user IDs, never a client-supplied destination. Resolve registered accounts via paginated auth API with explicit error handling. Grant access first. New authors receive an invitation stamp and author approval upon verified callback; readers never gain author privileges. Update existing author approval to grant beta before welcome, target the authenticated account email and report mail outcome separately from access success. Adapt legacy send-beta-invitations.ts to the guarded service with one explicitly selected recipient and dry-run default.
- [x] UI: add an invitation panel to /admin/beta with audience, selected recipient, explicit send action, access/mail status, daily remaining invitation attempts and honest error/retry copy. Link from user management for already-created accounts. Keep metrics independent. No send-on-load or bulk default. Update author approvals to show outcome.
- [ ] Verification and release: focused red/green regressions for access failure, auth-only recipient selection, duplicate delivery, provider failure, aged unknown attempts, HTML injection, concurrent daily limit and non-admin denial. Run lint, tsc, production build and full tests. Check local desktop/mobile preview through CUA, request independent spec and quality review, fix findings, commit explicit files, PR to platform, verify CI and Railway release SHA. Save per-file diff and 3–7 step QA. Actual inbox test still requires an explicitly chosen recipient.

## Acceptance examples

1. A selected author with no account clicks Create your account, verifies that same address, and receives author + beta access. A non-selected address remains locked out.
2. An existing reader receives reader instructions; an approved author gets author sign-in. A failed access grant sends no misleading welcome.
3. Double-clicking Send welcome produces a single logical message. A provider outage leaves a visible retryable outcome; a successful send followed by DB error cannot cause an automatic duplicate after 24 hours.
4. The 21st invitation attempt in one UTC day is stopped before Resend. Login and receipt emails are outside this allowance and still count toward the provider's plan quota.
5. Development preview never sends or grants access; production returns 404 for that preview.

## QA commands

From apps/web with Node 22: `npm test -- src/lib/emails src/lib/auth/beta.test.ts src/app/api/admin`; `npm run lint`; `npx tsc --noEmit`; `npm run build`; `npm test`.

## External evidence

SMTP is already Resend, hello@verkli.com. DKIM/SPF verified; tracking disabled. Supabase auth mail limit 30/hour. API /usage returned 404; account plan/monthly usage and recipient inbox placement remain unverified. No new subscription or mail campaign is authorized by this implementation.
