# Author landing: colour, motion and scroll chapters

Goal: refine the approved author landing with Verkli’s violet (#907AFF), rose (#E29ED5) and apricot (#FCC997), a responsive studio and the original butterfly mark. Visitors can explore writing, translation, narration and publishing before joining the waitlist.

Scope: signed-out author landing only. Use the existing Motion package. No new dependencies, schema changes or server-route changes.

## Implementation

1. Preserve the approved typography and composition. Remove repeated eyebrow labels and decorative status dots. Keep manuscript surfaces readable, with distinct brand accents for each tool.
2. Add scroll perspective and pointer-following reflected light to the studio. Focus or pointer interaction settles the editor. Horizontal touch gestures change tools; vertical gestures and editing retain their native behaviour. Keyboard navigation uses opacity transitions.
3. Make the book cover draggable with Arrow/Home/End keyboard equivalents. Preserve the visitor’s title and manuscript in the local reader preview.
4. Animate the two original butterfly paths from `favi.svg`. A short entry flutter and click/tap/Enter flight use independent wings. Fine-pointer movement adds spring tilt; reduced motion disables decorative movement. The invitation unfolds with scroll and settles when used.
5. Open feature chapters 01–04 as visitors scroll, reversing when scrolling back. At widths of at least 1101px and heights of at least 800px, both columns stay in view during a 720px scroll sequence. Smaller screens keep normal document flow. Manual chapter choices remain selected until the visitor scrolls into a new chapter; focused links are never collapsed.
6. Verify locally, review the complete UI diff against current `platform`, run CI, merge and verify the Railway deployment on `www.verkli.com`. The user explicitly approved publishing all these landing refinements.

Motion constraints: no scroll interception, forced audio, cursor replacement or hover-only controls. Gestures must not discard a draft. Reduced motion retains all functionality.

## QA

Local preview: http://127.0.0.1:3018/author

1. Scroll to “A little less friction.” Continue down: chapters 01, 02, 03 and 04 open in order. Scroll back up and confirm the sequence reverses. On a large desktop, both columns remain visible.
2. Click a chapter heading, wait, then use Previous/Next. The selection stays put until you scroll into another chapter. Focus an Explore link and scroll: the link keeps focus.
3. At mobile width, scroll normally through the chapters, then swipe horizontally to change one. Check that text and links remain readable and the page has no horizontal overflow.
4. In the studio, edit the sample title and manuscript; switch tools with clicks, arrow keys and horizontal swipes. Open the book in Publish and confirm your words carry through. Drag the cover and use its arrow keys.
5. Scroll to the invitation. Move over the butterfly, click or tap it, then focus it and press Enter. The original wings flap and settle. Get early access opens the waitlist. Audio elsewhere starts only after pressing Play and stops when leaving the player.
6. Repeat with reduced motion and dark mode. Controls remain usable; decorative motion is disabled. Check the deployed page at https://www.verkli.com/author after release.

## Verification

The new scroll tests failed before implementation. Targeted scroll, manual-selection, touch and keyboard-focus checks then passed. Visual inspection confirmed all four chapters and readable open text at 320×740, 390×844, 768×1024, 1101×800, 1440×760 and 1440×1000, with no horizontal overflow or browser runtime errors.

Production build (Turbopack), lint and all 169 unit files / 1722 tests passed. All 14 author UI tests passed without retries. A real Chromium vertical touch gesture opened chapters 01–04 in order. CI and deployment verification are recorded in the release PR.
