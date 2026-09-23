# Local illustration demo

This I1 package is a local, memory-only demo. It does not upload images, generate AI illustrations, save a real book or implement print export. Reload clears every approved demo image. Requires existing dependencies, Node22.12+ and installed Chrome for the browser suite.

From the repository root, start the fixture without real Supabase credentials:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon NEXT_PUBLIC_WAITLIST_ONLY=false NEXT_PUBLIC_SITE_URL=http://localhost:3071 npm run dev -w @verkli/web -- --port 3071
```

## Manual QA

1. Open http://localhost:3071/dev/book-illustrations. Check the explicit local-demo message and empty chapter/style prompt.
2. Select The harbour and Ink & sea; choose a local PNG/JPEG and placement. Add alternative text. Check actual pixel dimensions, proposal and unchanged original chapter text at desktop and390px.
3. Approve the demo preview, select another image, then Discard proposal. The approved image and text remain unchanged.
4. Select another image, enable Simulate approval failure and approve. Original and proposal remain. Disable failure and retry successfully.
5. Enable Hold image decoding, select an image, then change chapter or profile. Release images: the old image never appears in the new context. Reset demo releases all local preview URLs.
6. Try a corrupt image or unsupported format. Check readable errors; reload clears the demo. In a production build, /dev/book-illustrations returns404.

## Automated checks

```sh
npm test -w @verkli/web -- src/features/book-illustrations src/app/dev/book-illustrations --maxWorkers=2
cd apps/web
../../node_modules/.bin/playwright test --config playwright.illustrations.config.ts
```

Browser tests create synthetic PNG files using existing sharp, compare approved/proposed behavior, cover delayed image answers across chapter/style changes, malformed bytes and object URL cleanup. No provider, database, credentials, external upload or new dependency is needed.
