# R0 independent verification — 14 September 2026

Verification owner: a separate verifier who did not implement the candidate. Scope: the R0 task in [the launch task pack](../plans/2026-09-14-launch-task-pack.md). This report records new checks; it does not reuse the historical test counts in the candidate's 10 September QA document.

**Final local R0 gate passed on uncommitted tree `20d73d3665021c84fe88f8946f1c2a57ab65a043`: lint, TypeScript, 1,840 unit tests, production Turbopack build, all 10 unchanged launch checks and three JavaScript-disabled page checks.** The original build/QA failures and intermediate results are preserved below. This is not a full provider, authentication or purchase-journey verification.

## Exact candidates

- Worktree: `/Users/admin/verkli-web/.claude/worktrees/release-integration-20260914`.
- Base HEAD: `26d02239cf57cac050ada410e197692878145270`.
- Initial baseline staged tree: `df44b1952598e87982be30a4e264aa6a412c4cf5`, with **16 staged files and uncommitted integration changes**. The tracked working files matched that index during the baseline gate.
- After the integration owner's P1 retry fix, the intermediate candidate's **tracked working-tree hash was `4769d1272cc27ac591cb99ff0705c3ef3e0de8fe`**. This included the new `route.ts` change and the unstaged webhook/email regression and implementation updates. At that stage the actual index retained the older `df44b195` tree; HEAD or index alone did not identify that candidate.
- The final P1 + SSR candidate has **staged and tracked working-tree hash `20d73d3665021c84fe88f8946f1c2a57ab65a043`**. There are 21 staged files, including the existing QA plan, and no unstaged source changes. All newly introduced source/test files are included. These changes are still uncommitted on the base HEAD above.
- The final hash is generated using a temporary copy of the Git index, synchronizing existing tracked/staged paths from working files and writing that temporary tree. The real index is not changed. New untracked QA/review documents are outside this hash.
- No candidate commit was created by this verifier. A later commit with identical verified source must be linked to this source tree/hash; it does not automatically require another browser run. Any product-code changes require relevant fresh checks. The repository commit hook reruns lint, TypeScript, build and unit tests. This report does not claim that QA ran against a future commit SHA; documentation added after verification is outside the tested tree above.
- Runtime: Node `v22.17.0`, selected explicitly from `/Users/admin/.nvm/versions/node/v22.17.0/bin`. This satisfies `package.json`'s `>=22.12.0`; `.nvmrc` still contains `24`.

Raw evidence is under `node_modules/.cache/r0-verification/` in this worktree. `candidate-staged.diff` and `candidate-status.txt` record the baseline. `final-candidate.diff` records the final working diff against HEAD. Each check log records the exact command, runtime, environment, HEAD, staged tree, UTC timestamps and exit code; final logs also record the actual tracked working-tree hash. Baseline logs are preserved as `baseline-*.log`.

## Safety and environment

Read `AGENTS.md`, `src/lib/env.ts`, `src/lib/flags.ts`, `middleware.ts`, the launch Playwright config/spec and the target route guards before execution. App paths are relative to `apps/web`. The worktree has `.env.example` files only; no `.env` files were copied or loaded. Dependencies were already installed with `npm ci --ignore-scripts`; no new dependency was added.

The local runner reconstructs its environment from `HOME`, `TMPDIR`, `USER`, `LOGNAME`, `LANG` and an explicit Node 22 PATH. It does not inherit root provider keys, production Supabase configuration, Redis, cookies or account sessions. Lint, TypeScript and unit tests receive no application credentials. Build/start use:

```text
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://r0-verification.invalid
NEXT_PUBLIC_SUPABASE_ANON_KEY=r0-verification-dummy-anon-key
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3031
STRIPE_SECRET_KEY=sk_test_r0_verification_dummy
STRIPE_WEBHOOK_SECRET=whsec_r0_verification_dummy
BETA_LOCK=true
NEXT_PUBLIC_WAITLIST_ONLY=false
NEXT_PUBLIC_DISCOVERY_ENABLED=true
DISCOVERY_ENABLED=true
NEXT_PUBLIC_DEMO_FACADE_ENABLED=false
DEMO_FACADE_ENABLED=false
```

AI chat, audiobook generation, translations and marketing are explicitly false in both public and server forms. Other absent flags default off. There is no Supabase service-role key, Resend key, Redis URL, ops token, analytics key or usable paid-provider key. The Stripe strings are dummy configuration values, not credentials for an account. Full environment details are in `run-check.py` and the logs.

The launch suite uses a fresh anonymous Chrome context. Its two POSTs are `{}` without a Stripe signature and `{}` to feedback with the matching Origin; neither passes the guards before persistence or email. It does not submit signup, waitlist, support, checkout, AI or audio forms. Anonymous health is rejected before queue reads; the empty download query is rejected before Stripe or storage access.

## Baseline results — tree `df44b195`

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run lint -w @verkli/web` | PASS, exit 0; 14.584 s | `baseline-lint.log`, ended 15:23:55 UTC |
| `npm exec -w @verkli/web -- tsc --noEmit` | PASS, exit 0; 10.733 s | `baseline-types.log`, ended 15:24:11 UTC |
| `npm test -w @verkli/web -- --maxWorkers=2` | PASS, **175 files / 1,817 tests**, exit 0; 14.403 s | `baseline-unit.log`, ended 15:24:36 UTC |
| Initial `npm run build -w @verkli/web` | FAIL, exit 1; 8.039 s | `build-initial-failed.log`, ended 15:25:09 UTC |
| Same production build after existing Docker dependency preparation | PASS, exit 0; 18.624 s | `baseline-build.log`, ended 15:28:14 UTC |
| Production server on 3031 | Started and health 200; stopped only this owned listener before final rebuild | `baseline-start.log`; started 15:28:47 UTC |
| `playwright.launch.config.ts` | **FAIL: 8 passed / 2 failed**, no skips; exit 1; 134.732 s | `baseline-playwright.log`, ended 15:31:12 UTC |

Unit output includes expected error-path logs and skipped publication metrics without Supabase credentials; Vitest reports no failed or skipped tests. Signed-webhook delivery, retries and current-payment access checks are covered with mocked DB/email/payment I/O, not real delivery.

## Intermediate P1 gate — working tree `4769d127`

| Check | Result | Evidence |
| --- | --- | --- |
| Full lint | PASS, exit 0; 14.422 s | `p1-lint.log`, ended 15:38:08 UTC |
| Full `tsc --noEmit` | PASS, exit 0; 11.350 s | `p1-types.log`, ended 15:38:35 UTC |
| Full unit, maximum 2 workers | PASS, **175 files / 1,834 tests**, exit 0; 14.149 s | `p1-unit.log`, ended 15:38:59 UTC |
| Production Turbopack build | Not run on this intermediate tree | Integration owner paused builds for the SSR readiness fix |
| Production launch suite | Not run on this intermediate tree | Deferred until the SSR readiness fix |

The working-tree hash remained `4769d127` after these checks. The integration owner subsequently assigned targeted fixes for the two public-content SSR gates. The final gate below reran all checks after those edits, including public content with JavaScript disabled. This does not by itself prove that cold interactivity is fast; that remains separate F1 performance work.

## Final P1 + SSR gate — tree `20d73d36`

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run lint -w @verkli/web` | PASS, exit 0; 13.062 s | `lint.log`, ended 15:46:06 UTC |
| `npm exec -w @verkli/web -- tsc --noEmit` | PASS, exit 0; 3.095 s | `types.log`, ended 15:46:18 UTC |
| `npm test -w @verkli/web -- --maxWorkers=2` | PASS, **176 files / 1,840 tests**, exit 0; 14.258 s | `unit.log`, ended 15:47:04 UTC |
| `npm run build -w @verkli/web` | PASS, exit 0; 20.820 s | `build.log`, ended 15:47:30 UTC |
| Unchanged 10-case launch Playwright suite | PASS, **10/10**, zero skips/retries; exit 0; 62.939 s | `playwright.log`, ended 15:49:17 UTC |
| JavaScript-disabled public-content checks | PASS, **3/3 pages**, exit 0; 10.663 s | `no_js.log`, ended 15:49:48 UTC |

The final staged tree and tracked working-tree hash still matched `20d73d3665021c84fe88f8946f1c2a57ab65a043` after all checks. The production preview was verified at **`http://127.0.0.1:3031`**, listener PID **44640**, tool session **42514**. At the integration owner's request, only that preview was stopped at **15:52:51 UTC** before the mandatory commit-hook build; port 3031 was then confirmed free. The commit owner will restart it afterward using `python3 node_modules/.cache/r0-verification/run-check.py start` from this worktree. The runner invokes `npm run start -w @verkli/web -- --hostname 127.0.0.1 --port 3031` with the scrubbed environment above. `start.log` and `preview-handoff.json` record its provenance and handoff. No other local server or worker was stopped or started.

With `javaScriptEnabled: false`, `/author` visibly renders its H1, `/waitlist?access=pending` visibly renders the notice and correct account/support links, and ordinary `/waitlist` has no pending notice. All three respond 200. Screenshots and `no-js-results.json` are saved beside the logs. `final-access-notice-mobile.png` from the normal launch suite shows the notice already visible while the signup still says `Loading signup…`: visibility before hydration is fixed, and the suite now passes its original 5-second assertions, but these checks do not establish that all interaction is fast.

## Browser failures and timing diagnosis

The baseline failures are reproducible client readiness delays, not beta redirects or failed route responses:

- `e2e/launch-readiness.spec.ts:33`: `/product` correctly redirects to `/author`, which returns 200, but the H1 is absent for the 5-second assertion. Trace screenshots show the spinner from `src/features/author/AuthorLandingPage.tsx:45`; the public landing content waits for a client effect and `auth.getUser()`.
- `e2e/launch-readiness.spec.ts:54`: `/waitlist?access=pending` returns 200 but the access status is absent for the 5-second assertion. The screenshot still shows `Loading signup…`. `src/app/waitlist/page.tsx:420–421` requires hydration before rendering the access notice.

Both expected elements appear in teardown snapshots roughly 2.8–3.1 seconds after their assertion deadlines. All traced JS responses were 200. No Supabase or paid-provider network request appears; this is not evidence of an 8-second authentication network call.

Read-only timing diagnostics used the same production bundle without changing test timeouts or source. First observation times are measured from navigation, with polling and main-thread scheduling limits:

| Surface | Isolated cold context | Same-context cold/navigation | Same-context warm navigation |
| --- | --- | --- | --- |
| Author H1 | 10.042 s | 9.746 s | 4.046 s |
| Mobile pending-access notice | 10.610 s | 6.676 s, shared chunks already warm from author page | 2.606 s |

HTML response completion was 4.9–105.3 ms in these diagnostic navigations. The renderer reached **107.4% CPU** in the process samples; GPU peaked at 7.5%. Main-thread long tasks reached **2.537 seconds**, and one `page.evaluate` was delayed 3.399 seconds. This is observable UI latency in a local production build and is strongly cache dependent; the evidence does not establish performance on live hardware or the exact expensive JavaScript function. No CPU/network throttling was applied. The isolated mobile diagnostic had no horizontal overflow after hydration.

The author diagnostic also recorded a prefetched beta redirect upgrading to `https://127.0.0.1:3031/waitlist` and failing TLS. This is a separate HTTP-localhost/production-CSP artifact; the mobile hydration delay reproduces without that error.

Evidence: `playwright-initial-artifacts/` preserves both traces and error contexts; `trace-inspection/` contains screenshots before timeout; `page-timing-diagnostic.json`, `page-timing-cold-warm.json` and `diagnostic-cold-warm-cpu.json` record timing and CPU. The diagnostic run's exit 0 means it completed observation, not that either failing assertion passed.

The diagnosis led to the integration owner's targeted SSR fix: the author landing renders while auth is unresolved, and a server wrapper passes the pending-access query result into the existing waitlist client. The client file was moved with only that input/guard change. Signup history and interaction still wait for hydration; authenticated dashboard handling remains gated by the existing auth state. No broad assertion timeout increase was made. The independent verifier has not changed production source or the launch assertions. Profiling and reducing cold interactivity delay remains separate F1 work.

## Build failure and reproduction

The initial production Turbopack build fails with `TurbopackInternalError: missing field napi_versions at line 46 column 3` in `NodePreGypConfigReference::resolve_reference`. The manifest excerpt exactly matches `node_modules/zipfile/package.json` version `0.5.12`, including `mapbox-node-binary.s3.amazonaws.com`.

The existing `infra/docker/Dockerfile.web:57–82` describes this exact optional dependency failure and removes `zipfile` during Docker dependency preparation. `node_modules/epub/epub.js:6–10` catches an unavailable `zipfile` and falls back to `adm-zip`. This identifies an install-preparation difference; it does not establish an R0 source regression.

The integration owner authorized matching that existing dependency preparation. At 15:27:56 UTC all nine directories listed by the Docker deps stage were moved, not deleted: `zipfile`, `agentic-flow`, `agentdb`, `@xenova`, `onnxruntime-node`, `argon2`, `bcrypt`, `better-sqlite3`, `hnswlib-node`. They remain in `/var/folders/11/9dj0k4wx0w17q01cdl42sr2c0000gn/T/verkli-r0-dependency-quarantine-9zzxhvns`, outside the worktree. `dependency-quarantine.json` records each original/destination path so the operation is reversible. No manifest, lockfile or source was changed.

With that preparation the **same unmodified Turbopack build passed**, including TypeScript, 159 generated pages and emitted middleware. No webpack or dev-server result was substituted. Non-fatal build notices: Sentry release/source-map upload was skipped because no auth token was provided; an edge-runtime page cannot be statically generated. This run checks a macOS production bundle, not a Linux Docker image build.

Exact command, from the named worktree (fails with the initial unprepared dependency tree and passes with the documented preparation):

```sh
python3 node_modules/.cache/r0-verification/run-check.py build
```

The runner invokes the required unmodified `npm run build -w @verkli/web` with the scrubbed environment above. Full manifest observation is saved in `dependency-observation.json`.

## Live baseline

Fresh anonymous probes at **2026-09-14 15:24:17 UTC**, recorded in `live-negative-probe.json`:

- `GET https://www.verkli.com/api/health`: 200, `version: "26d0223"`.
- `POST https://www.verkli.com/api/stripe/webhook`, JSON `{}`, no signature or cookies: **403**, `{"error":"Beta access required"}`.

At **15:29:38 UTC**, the baseline candidate's identical unsigned `{}` POST returned **400**, `{"error":"INVALID_REQUEST_BODY"}`; see `baseline-candidate-negative-probe.json`. The final tree was probed again at **15:48:48 UTC** with the same **400** response; `candidate-negative-probe.json` includes final tree `20d73d36`. This independently reproduces the original live beta-wall failure and proves the candidate request reaches signature-input rejection. Neither probe changes a user account or sends a signed Stripe event.

## Local QA script

The safe production server was verified at `http://127.0.0.1:3031` and is stopped for the commit-hook build. Run these steps after the commit owner restarts it with the exact safe command above:

1. Open the running production preview at `http://127.0.0.1:3031/author/signin`. For a fresh rebuild, stop only this preview, use the documented dependency preparation, run `run-check.py build`, require exit 0, then `run-check.py start` on a verified-free 3031.
2. From the worktree run `python3 node_modules/.cache/r0-verification/run-check.py playwright`. This selects installed Chrome and `LAUNCH_QA_URL=http://127.0.0.1:3031`; require all 10 launch checks to pass.
3. While signed out, open `/author/signin` and follow Privacy and Terms; check `/product`, `/pricing`, `/faq` and `/support`. An empty support form must remain disabled.
4. At 390 px width open `/waitlist?access=pending`; check the readable notice, account/support links and absence of horizontal overflow. Ordinary `/waitlist` must not claim a signed-in state.
5. Open `/author/home` and `/reader/library`; both must redirect to waitlist. Open `/order/ta-for-er/success` without a session; it must show pending status and no download link.
6. Run `python3 node_modules/.cache/r0-verification/run-check.py no_js`. Require the author H1 and pending notice/account/support links with JavaScript disabled, and no pending notice on ordinary waitlist. This is a content check, not signup or authentication.

## Limits

The scoped local R0 gate passed on the exact uncommitted tree above. No production deploy, full author/reader journey, real authentication, account permission change, live purchase, actual inbox delivery, storage download, worker consumption, provider generation, RLS isolation or rollback was performed. The static/unit/public-page results are not evidence for those separate launch gates. Cold JavaScript readiness remains F1 performance work; the prior timing observations must not be presented as a post-fix interaction benchmark or as resolved by SSR alone.
