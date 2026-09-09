# Waitlist Studio mockups — 2026-09-09

## Change
The public `/waitlist` product illustration now uses three matching images generated with the built-in **image_gen** tool. The interactive Write / Translate / Create audio selectors still work. Real HTML captions, button labels, pressed state and keyboard support stay outside the image. Audio is explicitly illustrative.

This continues on `codex/landing-mockup-20260908`, updated to `platform` commit `fdc6e2f` before publication. The `/author` mockup is already published in that base. No signup API, schema, dependency or production configuration changes.

Local preview: http://127.0.0.1:3017/waitlist

## Files
- `apps/web/src/app/waitlist/WaitlistProductPreview.tsx`: three image states with accessible controls and live captions.
- `apps/web/src/app/waitlist/waitlist.css`: mockup presentation, mobile controls, fixed scene dimensions and reduced motion.
- `apps/web/e2e/waitlist-public.spec.ts`: two new browser regressions covering switching, image loading, keyboard activation, stable height and no AI requests.
- `apps/web/public/images/waitlist-studio-write-v1.png`
- `apps/web/public/images/waitlist-studio-translate-v1.png`
- `apps/web/public/images/waitlist-studio-audio-v1.png`
- This QA and generation record.

All images are 1254 × 1254 PNGs, stored in the project. Next Image serves responsive optimized versions. The initial writing image has priority; the other states load eagerly to make switching immediate. The square scene reserves its full dimensions before decoding.

## QA script
1. Open the local preview and confirm the dimensional writing mockup matches the Verkli brand.
2. Select Translate, Create audio and Write. Confirm the image, pressed button and caption change together.
3. Tab to each selector and press Space or Enter. Confirm focus stays visible and the selected state changes.
4. Check 320, 390, 1024 and 1440 px widths. Confirm readable controls, no horizontal overflow and no jump when switching.
5. Switch between author and reader, entering an `example.test` draft in each field. Confirm both drafts persist; do not submit a real signup.
6. Enable reduced motion and reload. Confirm all three images and native controls remain usable.

## Verification
- Red: both new tests failed on the old component because the writing image did not exist.
- Green: all 10 waitlist browser tests passed on the development preview, including existing role, duplicate, error/retry and mobile order-navigation checks. API submissions were mocked; no real records were created.
- Unit: 166 test files / 1,694 tests passed.
- Visual: all three views checked at 320 / 390 / 1024 / 1440 px with zero page errors, console errors or write requests.
- Final build / TypeScript: `npm run build -w @verkli/web` passed with Turbopack and synthetic public environment values.
- Final lint: `npm run lint -w @verkli/web` passed.
- Final production preview: all 10 browser tests passed after `next start`, including the complete mockup height check across all three states. The 320 / 390 px screenshots confirm all selector labels fit on one line and no image, button or document overflow occurs; zero page errors, console errors or writes. Preview remains running on port 3017.
- Approved publication target: https://www.verkli.com/waitlist (also served at https://web-production-267e.up.railway.app/waitlist). This release includes all seven remaining waitlist files listed above.
- Release unit checks: 167 files / 1,705 tests passed against the latest `platform` base.
- Release build / TypeScript and lint passed. All 10 browser tests passed against the production preview with `BETA_LOCK=true`, using mocked signup responses. All three image states passed visual checks at 320 / 390 / 1024 / 1440 px, with no overflow, console errors or write requests. The local HTTP test browser bypassed CSP's HTTPS-upgrade directive; live verification uses normal production CSP.
- Publication status and post-deploy evidence are recorded in `/tmp/verkli-waitlist-publish-20260909/` after release.

## Image generation
Mode: built-in image_gen; one edit of the user-supplied cropped workspace mockup, followed by two matching UI-state edits of that generated result. No CLI or API-key fallback.

Original generated files:
- Write: `/Users/admin/.codex/generated_images/01a07079-b7cb-7c33-b065-ed18493c2ddd/exec-0c61ad5e-2f9d-4ef3-bde1-d2c6d58fd543.png`
- Translate: `/Users/admin/.codex/generated_images/01a07079-b7cb-7c33-b065-ed18493c2ddd/exec-ecdb85f0-88f2-4996-b471-2c2b2a98aaf2.png`
- Audio: `/Users/admin/.codex/generated_images/01a07079-b7cb-7c33-b065-ed18493c2ddd/exec-62fd1e04-14c2-4be7-a746-efcf2e43eaf3.png`

### Final Write prompt
```text
Use case: product-mockup. Edit the supplied Verkli workspace screenshot into a spectacular, premium, photorealistic 3D SOFTWARE product mockup for the right side of a dark AI startup landing page. Create a square 1:1 image, high resolution. The input is a visual reference and the editing target. Preserve Verkli's identity and the idea of the writing workspace; radically elevate the materials, lighting and composition.

A single large elegant floating writing-app window is the hero. It has a precise thin graphite and polished glass edge, dimensional depth, a luminous warm-white interior, gentle three-quarter perspective (nearly front-on and perfectly readable), believable shadows beneath it. It occupies roughly 80% of the square image, complete with comfortable margins. Behind its lower-left edge, two extremely subtle offset translucent UI sheets suggest layers of a connected workspace. These must read as glass application layers, not books. Restrained cinematic violet #907AFF rim light from left and apricot #FCC997 rim light from right, with muted rose #E29ED5 between. Expensive soft diffuse light, deep inky near-black #0b0b10 background, edges of the image fade naturally into black. A delicate horizon reflection gives it weight. High contrast, meticulous materials, restrained editorial product launch art direction, aspirational yet real. No glowing blobs, no holographic gimmicks.

The app top bar uses the actual two-leaf butterfly Verkli mark from the reference (violet, rose, apricot leaves, not a generic butterfly), small lowercase wordmark "verkli" and a quiet small label "STUDIO". Typography is sophisticated: clean rounded Montserrat Alternates-style UI titles, fine neutral sans labels, elegant readable serif manuscript prose. Slim narrow toolbar with small writing icons. No giant outer headline and no decorative text outside the mockup.

Central window content:
small label "MANUSCRIPT" and "Chapter 01".
Large black editorial heading exactly "It starts with your imagination." on 2 or 3 beautiful short lines.
Below, two short paragraphs, typeset perfectly, exactly:
"The city was still asleep when she opened the window. Somewhere beyond the rooftops, a new world was waiting."
"She had a story to tell."
Then the sentence "And this was only the beginning." highlighted with a translucent soft violet selection and a slender violet caret.
Fine footer small exact text "Your words. Your next chapter."
Design a subtle narrow right-side tool rail with 3 small recognizable line icons for writing, translation and audio. Do not add a second big text column.

Only one small floating frosted-glass contextual card at the lower right overlaps the border slightly. Its small header "Creative partner", a tiny elegant violet spark icon, and exact text "A little help. Still your voice." This card is physically believable and grounded in the composition, not arbitrary decoration.

Remove the original screenshot's outer label "YOUR STORY, IN EVERY DIMENSION", the separate bottom Ebook/Translations/Audiobook boxes and the outer disclaimer; those are live HTML on the website. Do not include a web browser address bar, navigation, full webpage, physical books, laptop keyboard, stock office scenery, people, fake revenue/usage metrics, partner logos or watermark. Keep all objects inside the square canvas. Produce a single finished raster scene with exceptional light, shadows, perspective, beautifully typeset UI and natural black outer edges.
```

### Final Translate prompt
```text
Use case: precise-object-edit. Edit this finished Verkli writing studio product mockup into the MATCHING TRANSLATION VIEW. Preserve the exact square canvas, camera angle, frame silhouette, physical glass layers, black background, violet / rose / apricot lighting, reflections, brand leaf mark and wordmark, typography quality, scale and placement. This belongs to a three-image carousel; all major edges and objects must stay in precisely the same places. Do not redesign the scene or add objects.

Only change the UI inside the hero window and the small front-right contextual card:
- The top three tabs remain "Write", "Translate", "Create audio". "Translate" is the selected white pill with violet icon/text; the other two are muted.
- Main small upper-left label "TRANSLATION STUDIO". Upper-right "Chapter 01".
- Large rounded editorial heading exactly "Your story. More languages." on two short lines.
- Replace the manuscript prose with three elegantly spaced full-width language rows, divided by very fine light-gray lines. Each row uses a tiny pale violet language badge on the left, a language name, and a readable serif sentence. These are the exact texts:
EN | English | "And this was only the beginning."
SV | Swedish | "Och det här var bara början."
ES | Spanish | "Y esto era solo el comienzo."
Give the Swedish row a very subtle violet highlight. No giant flags, no green success badges.
- The slender right tool rail selects the translation icon.
- Window footer exact text "A new language. Still your story."
- The front-right floating card retains identical frosted glass shape/lighting. Small heading "Translation studio". Exact main text "Keep the meaning. Keep your voice." with a small restrained language icon.

Keep all text correctly spelled, crisp, aligned and beautifully typeset. Preserve every aspect of the original premium product photograph outside the requested UI text/state changes. No physical books, laptops, new devices, new typography styles, external captions or watermark.
```

### Final Audio prompt
```text
Use case: precise-object-edit. Edit this finished Verkli writing studio product mockup into the MATCHING AUDIOBOOK VIEW. Preserve the exact square canvas, camera angle, frame silhouette, physical glass layers, black background, violet / rose / apricot lighting, reflections, brand leaf mark and wordmark, typography quality, scale and placement. This belongs to a three-image carousel; all major edges and objects must stay in precisely the same places. Do not redesign the scene or add objects.

Only change the UI inside the hero window and the small front-right contextual card:
- The top three tabs remain "Write", "Translate", "Create audio". "Create audio" is the selected white pill with violet icon/text; the other two are muted.
- Main small upper-left label "AUDIOBOOK STUDIO". Upper-right "Chapter 01".
- Large rounded editorial heading exactly "Give your words a voice." on two short lines.
- Replace the prose with a beautiful precisely drawn audio waveform made of many fine rounded vertical bars, in the brand gradient violet #907AFF through rose #E29ED5 into apricot #FCC997. This is the centerpiece, sophisticated and controlled, with one slender vertical playback marker. Plenty of warm-white whitespace.
- Beneath the waveform a tasteful small round play control, a fine minimal progress line, and short exact labels "Chapter 01" and "Narration preview". Below these, a readable serif excerpt exactly "Somewhere beyond the rooftops, a new world was waiting."
- The slender right tool rail selects the audio waveform icon.
- Window footer exact text "Your words. A new dimension."
- The front-right floating card retains identical frosted glass shape/lighting. Small heading "Audiobook studio". Exact main text "Your manuscript. Ready to be heard." with a small restrained waveform icon.

Keep all text correctly spelled, crisp, aligned and beautifully typeset. Preserve every aspect of the original premium product photograph outside the requested UI text/state changes. No physical books, headphones, microphones, laptops, new devices, new typography styles, external captions or watermark.
```
