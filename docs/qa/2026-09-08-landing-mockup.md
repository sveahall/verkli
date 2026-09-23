# Verkli Studio mockup — 2026-09-08

## Scope
The regular public author landing page at `/author` now presents a generated Verkli Studio product concept beside the headline. This work started from `platform` commit `9cdc59b`, on `codex/landing-mockup-20260908`, and was fast-forwarded to `4718777` before the approved author-page release.

Changed files:
- `apps/web/src/features/author/AuthorLandingPage.tsx`: responsive hero, concrete product introduction, Montserrat Alternates headline, real Verkli mark, accessible image description and visible concept caption.
- `apps/web/public/images/verkli-studio-mockup-v1.png`: new 1536 × 1024 image, 1.8 MB original. Next Image serves responsive optimized sizes; the old image is preserved.
- `apps/web/middleware.ts`: exact public exceptions for `/author` and `/how-it-works` under `BETA_LOCK`; workspace and API access remain gated.
- `apps/web/middleware.test.ts`: six regression cases covering public pages and gated workspace / lookalike paths.
- This QA / generation record.

Preview: http://127.0.0.1:3017/author

## QA script
1. Open the preview signed out. Confirm the real Verkli logo, “Your story. Supercharged.” headline and the new studio / audiobook mockup.
2. Resize to 1440, 1024, 768, 390 and 320 px. Confirm the headline fits, the complete image stays visible and no horizontal scrolling appears.
3. Use the theme toggle. Confirm the image and its caption remain clear in both themes.
4. Tab to “Start for free” and “See how it works”. Open each and confirm the signup / explanation page loads.
5. Enable reduced motion and reload. Confirm the headline and image remain visible. With `BETA_LOCK=true`, confirm `/author/home` redirects to `/waitlist` and `/api/books` returns 403 while signed out.

## Verification
- Lint: passed, `npm run lint -w @verkli/web`.
- Unit tests: 166 files / 1,694 tests passed, `npm run test -w @verkli/web`.
- Production build / TypeScript: passed, `npm run build -w @verkli/web` (Turbopack, matching the production build command), with synthetic public environment values.
- Browser: 320 / 390 / 768 / 1024 / 1440 px in light mode, plus 390 / 1440 px in dark mode; no horizontal overflow or page / console errors. Image loaded at its complete 3:2 ratio. Both CTA destinations opened. Reduced motion and keyboard focus checked. A cold dev compilation required a longer navigation timeout; no app change was needed.
- Desktop's optimized 828 px image response measured 169,165 bytes, versus 1.8 MB for the retained original.
- Final production preview: 1440 / 390 px checks passed after `next start`; image loading, layout, CTA navigation, keyboard focus and reduced motion verified with zero page / console errors and zero write requests. Preview remains running on port 3017.
- Browser checks are read-only, with all write requests blocked. No real signup, waitlist, payment or AI generation jobs are submitted.
- The image is a product concept with an example manuscript, not a claim that the live editor has this exact interface.
- Publication scope: the approved `/author` hero and its public reachability. The separate waitlist mockup changes remain outside this release. Production target: https://www.verkli.com/author.
- Release checks on 2026-09-09: lint passed; 167 unit test files / 1,705 tests passed; Turbopack production build and TypeScript passed with `BETA_LOCK=true`. The two public-route regression cases first failed with 307 instead of 200, then passed after the narrow middleware fix.
- Release browser check: 1440 / 390 px passed with `BETA_LOCK=true`; `/author`, `/how-it-works`, `/author/signup`, `/waitlist` returned 200, `/author/home` redirected to the waitlist and `/api/books` returned 403. The local HTTP test browser bypassed CSP because production’s `upgrade-insecure-requests` upgrades redirects to HTTPS; live HTTPS verification uses normal CSP.
- Live deployment status and browser evidence are recorded after publication in `/tmp/verkli-author-publish/`.

## Image generation
Mode: **built-in image_gen**, one new image. No CLI/API fallback, no new dependency, no source images.

Project asset: `apps/web/public/images/verkli-studio-mockup-v1.png`

Original generated file: `/Users/admin/.codex/generated_images/01a07079-b7cb-7c33-b065-ed18493c2ddd/exec-c95b6768-5302-45bb-b73f-5968c7af662c.png`

Final prompt, verbatim:

```text
Use case: product-mockup.
Create one spectacular, premium product launch image for Verkli, an AI writing, translation and audiobook platform. Landscape 3:2 composition, very high resolution, polished photorealistic 3D product photography and art direction. This is a finished visual asset to sit full width under the heading of a real website, not a screenshot of a website, no surrounding page, no marketing headline outside the devices.

SCENE: a restrained midnight graphite studio, near-black charcoal edges, a continuous curved horizon of soft luminous glass behind the product, violet (#907AFF) on the left flowing into muted rose (#E29ED5) and warm apricot (#FCC997) on the right. Rich deep blacks, crisp highlights, believable soft grounded shadows, subtle reflections on polished dark stone. The light feels expensive and sculptural. Avoid excessive bloom, neon cyberpunk, stars, sparkles, clutter, unrelated shapes. Beautiful luminous contrast, genuinely premium detail.

HERO OBJECT: one large, impossibly thin, elegant landscape glass display with a dark graphite precision metal edge, filling about 75 percent of the scene width, gently angled in three-quarter perspective with an almost front-on readable face. This is the Verkli creative workspace, NOT an analytics dashboard. Layered off-white UI inside the screen: a narrow left manuscript sidebar, wide white writing canvas, restrained violet assistant area on the right. Superb fine UI detailing, abundant whitespace, tiny toolbar icons, no revenue charts. Exact wordmark "verkli" in restrained small lowercase sans serif at top left. Three clear small tabs "Write", "Translate", "Audio". Sidebar small heading "MANUSCRIPT" and numbered chapter entries. Large serif title on the writing canvas "The arrival". Below it the exact sentence "The morning the lighthouse went dark, Nora found a letter beneath the door." Then a small amount of quiet typesetting to suggest a manuscript. Right column title "Creative partner" and a small luminous violet suggestion card, with short text "Find your next sentence." All text that is large enough to read must be correctly spelled.

A slim graphite smartphone sits in the lower right foreground, overlapping only the far right edge of the large screen without obscuring its writing canvas. Its beautifully crafted dark audiobook-player UI features a small atmospheric fine-art photograph of an actual lighthouse on a rocky coast at dusk (NOT an illustrated book cover, no physical books). Under it exact title "The arrival", small caption "AUDIOBOOK", a delicate violet-to-apricot audio waveform and a neat circular play control. Screen glass is flawless, materials tangible. No Apple or other third party logos.

One small refined frosted-glass translation card floats just in front of the lower-left edge of the display, with exact simple text "English → Spanish" and "Your voice. A new language." This is the only floating card. Composition reads at a glance: write, translate, listen, all connected.

COMPOSITION: complete objects in frame with comfortable 7% margins; main writing display dominates, phone is secondary. Camera at product height, refined slightly elevated three-quarter product view, shallow perspective, straight geometry, intentional asymmetry, no extreme tilt. Keep the upper corners and outer edges dark and clean so the asset can sit on a #0b0b10 web section. Strong controlled lighting across actual surfaces, rich three-dimensional depth. No pastel toy books, no stacks of novels, no stock office setup, no desk accessories, no hands or people, no holographic sci-fi clutter, no generic AI brain/orb, no fake metrics, no watermark. Outstanding realistic product materials and editorial tech launch art direction.
```
