# Saved illustration insertion QA

Scope: an existing private saved candidate enters the real Tiptap manuscript as an image node using the existing autosave/CAS path. Normal and focus views share owner/book/edition/chapter-scoped in-memory recovery. Reader delivery uses session/RLS chapter, book and edition reads, the existing read-access rules, exact content membership and private asset integrity checks. No dependencies, schema or bucket changes.

## Six local QA steps

1. From the repository root with Node 22.17+, start the development fixture with synthetic public configuration: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:3075 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-public-key NEXT_PUBLIC_SITE_URL=http://localhost:3075 npm run dev -w @verkli/web -- --port 3075`. Coordinate the single Next slot first. No real credentials are required.
2. Run `npx playwright test --config apps/web/playwright.illustration-insertion.config.ts --headed`. The fixture is `/dev/illustration-insertion`; Playwright supplies synthetic auth and illustration responses. The synthetic sign-in requires those mocks and cannot authenticate against production.
3. Verify insertion preserves existing prose, accepts an edited description, and participates in Undo/Redo. Wait for browser-local save, reload, then inspect the reader preview's protected image URL.
4. Verify denied image permission retains the manuscript and description for retry. A response from another edition is rejected; delayed responses after chapter/account changes cannot insert anything.
5. Verify sign-out hides loaded private manuscript images and the toolbar. Unsaved text survives return to the same owner, including an intervening chapter remount. No held text is written into the other chapter. Failed-save recovery must also survive another sign-out/sign-in cycle.
6. Inspect desktop and 390px mobile screenshots and run the scoped tests/lint/typecheck. The release owner must run full lint/test/build and verify production returns 404 for the dev fixture before integration. Release the development port after QA.

## Evidence and limits

Browser tests exercise real Tiptap, session subscription and renderer with synthetic network responses and browser-local persistence. They do not prove live Supabase RLS, private storage delivery, production persistence, paid providers, publishing or deployment. Reader unit tests use the real access/service/repository code with mocked data boundaries, including session-hidden chapter/book/edition rows despite paid entitlement and an admin client that could see those rows.

The pending-draft map lives only as long as BookEditorView. Closing/reloading the page with an unsaved held draft is not durable recovery. The existing writer owns queued persistence failures and CAS baselines. Requests already handed to that writer before a session change may finish; the new guard pauses future editor handoffs. Print PDF export explicitly rejects illustrated content through its existing unsupported-image error; this package does not add print layout support.

The implementation was based on e58b3fa035a6c5c04bbcd6cd6b1ee7fd2ea3aaa6. Detailed logs, screenshots and filewise diffs are in the local delivery directory `bokverktyg/manuscript`.
