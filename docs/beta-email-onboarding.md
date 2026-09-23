# Beta welcome emails

Use `/admin/beta` as an administrator. Choose a waiting-list recipient or find an existing account, prepare the welcome, check the address, then select **Enable access & send welcome**. `/admin/users` links here. Author-application approval also enables author and beta access before sending the author welcome.

## Access and delivery

- New invitees must create and verify an account with the exact invited address. Selected authors receive author approval and beta access on the verified callback; readers receive beta access only. An explicitly revoked flag is never restored by an old invitation.
- Existing accounts receive the appropriate sign-in instructions and password-reset guidance. The canonical Auth email is used, not an editable application contact address.
- Author beta Pro access follows the existing beta entitlement implementation; generation limits still apply. Reader emails promise no author plan or unimplemented physical fulfillment.
- Access and email acceptance are separate outcomes. Delivery errors leave authorized access enabled, display the result and allow a safe retry. Accepted does not mean inbox placement.
- The private, append-only `audit_log` stores immutable welcome payloads and acceptance. One welcome per normalized email and audience; an author welcome may follow an earlier reader welcome. Never delete these delivery records while invitations remain active.
- Resend retries reuse the same frozen payload/key for at most 23 hours. After that, inspect Resend delivery history before any manual follow-up. The interface does not force an unsafe resend. Legacy invitation stamps also require review; they are not automatically resent.
- At most **20 invitation attempts per UTC day**, reserved atomically across instances. Failed attempts count. Authentication, receipts and rejection notifications are outside this allowance and count toward the provider's overall quota. This cap does not prove remaining monthly Resend allowance.
- No dependency, schema or subscription change is required. `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and service-role Supabase access are required. New-account invitations stop if `BETA_AUTOGRANT_FROM_WAITLIST=false`.

## QA (local, without sending)

1. With Node 22, run `npm run dev -w @verkli/web -- --port 3153`; open `/dev/beta-emails`. Compare new/existing author and reader variants, exact address, CTA, password help and plaintext.
2. Open `/dev/beta-invitations`. Select one fixture and confirm. Verify provider-acceptance status and the remaining counter; no real provider is used.
3. Repeat the same fixture: verify the duplicate message and unchanged logical send count. Enable **Simulate a delivery failure**, choose the other fixture, and verify retry guidance.
4. Switch to **Existing accounts**, find an account and check its confirmation. Inspect narrow and wide layouts. Both development preview pages return 404 outside development.
5. Run `npm test -w @verkli/web -- src/lib/emails src/lib/auth/beta.test.ts src/lib/admin/beta-invitations.test.ts src/app/api/admin`; run lint, TypeScript and production build with the same public build environment as CI.
6. Before inviting real testers, send only to an explicitly authorized test address through `/admin/beta`. Verify actual inbox/spam placement, the link, account access and a successful sign-in; reload the dashboard and confirm the saved delivery status. This real inbox test has not been performed by the implementation.

The operator script remains dry-run by default. `--apply` now requires `--only <email>` and uses the same guards; unbounded batch sending is removed. Rendering a preview requires neither credentials nor a send.
