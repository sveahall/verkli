# Interactive author landing — 9 September 2026

Replaces the repeated device illustrations on `/author` with an interactive story: an illustrated hero with language and listening controls, a paper editing demo with undo, a bilingual excerpt and an audiobook player. Keeps Verkli's logo, Montserrat Alternates, violet/rose/apricot palette, publishing explanation, FAQ and waitlist invitation.

## Scope and behavior

- Prepared writing examples, explicitly labelled as an interactive demo. No live generation, account requirement or submission of visitor text.
- English, Swedish, French and German samples use the existing committed recordings in `apps/web/public/demo-assets/audio/`. The transcript source is `scripts/regenerate-demo-audio-elevenlabs.ts`; the original story is in `apps/web/scripts/seed-data/haunted-diary.ts`. Neither script was executed.
- A single audio element serves the hero and player. Playback begins only on a click, pauses on language change/hidden tab/unmount, uses real media time and duration, and supports speed, seeking, replay and error recovery. Waveforms are RMS envelopes measured from the four recordings.
- Hero CTA now opens the on-page demo; the adjacent CTA leads to the waitlist. Authentication, dashboard, backend, pricing and waitlist submissions are unchanged. No dependency or database changes.
- One new cinematic artwork appears in the hero. Lower sections use native text and controls. Motion respects reduced-motion preferences; the record spins only while playback is active.

## QA in five steps

Preview: http://127.0.0.1:3017/author. Public URL after deployment: https://www.verkli.com/author.

1. Open the public page signed out. Confirm the new story artwork and that no sound starts automatically. Click **Try the studio** to reach the writing demo.
2. Click **Make it vivid**, then **Make it concise**. Use the restore button and confirm the original text returns. Tab through the controls and activate them with Enter.
3. In the translation section choose **Svenska**, **Français** and **Deutsch**. Check that the excerpt changes and the selected language is marked. Start audio, switch language and confirm it stops rather than overlapping.
4. Press **Play sample**. Check advancing time, pause/resume, speed, seeking and replay after the end. Expand **Read along**. If the audio request fails, verify the error message and recover by choosing another language or retrying.
5. Test a narrow mobile viewport and reduced motion, then desktop light/dark mode. Check all controls, FAQ expansion and the final **Join the waitlist** link; do not submit a test email to production.

## Verification

- RED: the rewrite test failed against the prior static page because no writing demo existed.
- GREEN: all 5 browser regressions pass. Covers rewrite/undo, keyboard activation, shared audio, elapsed time, language reset, failed media recovery, speed, seeking/replay, mobile fit and waitlist navigation. Test routing rejects non-read requests.
- `npm run lint`: passed.
- `npx tsc --noEmit` in `apps/web`: passed.
- `npm run build`: passed using the normal production Turbopack build.
- `npm test`: 168 files / 1,710 tests passed.
- Run media tests without other competing browser sessions: intentional pause-on-hidden behavior interrupts audio if another browser takes focus.
- Browser logs and screenshots: `/tmp/verkli-experience-20260909/` on the development machine.
- Responsive checks: 320, 390, 768, 1024, 1440 and 1920px; dark mode at 390 and 1440px. No horizontal overflow or page exceptions, all 18 demo buttons meet 44px height, anchors/FAQ checked. Translation changes are announced politely to screen readers.

## Image provenance

Built-in image generator, 9 September 2026. Output copied without image edits from:
`/Users/admin/.codex/generated_images/01a07079-b7cb-7c33-b065-ed18493c2ddd/exec-15625b46-958d-4996-8bf5-274ecd8ec5a0.png`

to `apps/web/public/images/verkli-story-world-v1.png` (1536 × 1024). Served through Next Image with responsive sizes. The artwork is illustrative; all interactive controls and readable excerpts are HTML.

Prompt:

> Use case: illustration-story. Asset type: one cinematic hero artwork for Verkli, an AI writing and publishing studio. Create a beautifully art-directed, photoreal surreal scene: a small open ivory-paper diary rests on a dark reflective surface in a vast midnight-blue space. A flowing trail of loose paper pages lifts from the diary and becomes a sweeping sculptural wave that leads toward a brilliant warm apricot horizon. Fine streams of ink turn into a few delicate rose and violet light filaments between the pages. The sense is a story becoming an entire world, mysterious and inviting, not spooky or sinister. Strong dramatic depth, tangible paper edges and subtle paper grain, warm sunrise illumination catching the pages, rich navy shadows, restrained cinematic bloom. Sophisticated, visually bold campaign art. Composition: landscape 1536x1024, flowing diagonal from lower left to upper right, with the brightest sculptural paper forms in the upper and right two-thirds and deep clean shadows in the lower third for a real HTML quote and controls to be overlaid. The diary is small relative to the sweeping imagined world. Brand accent palette violet #907AFF, rose #E29ED5, apricot #FCC997, with deep ink navy and luminous ivory. NO text, NO typography, NO letters, NO logos, NO device, NO screen, NO UI, NO mockup frame, NO people, NO floating geometric rings. Full-bleed artwork only.
