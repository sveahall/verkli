# Author Studio — 2026-09-09

Preview: http://127.0.0.1:3017/author#studio
Production target (not published): https://www.verkli.com/author#studio

Publication is pending explicit approval for this version. Automatic approval review rejected the direct push to the shared `platform` deployment branch. The local preview and all verification are complete.

## Change

| Before | After |
| --- | --- |
| Separate decorative scenes and disconnected examples | One full-width interactive studio with Write, Translate, Listen and Publish |
| A rewrite replaced the passage immediately | Review a suggestion, accept it explicitly, or undo it |
| Fixed book illustration | Editable title and manuscript carried into an opening reader preview, with three cover colours |
| Repeated feature sections | Compact, expandable product explanation and a direct early-access invitation |

Verkli's existing logo, typography and violet/rose/apricot palette remain. No dependencies, schema, authentication routes or paid generation calls were added. `platform` is the release base; `main` is unchanged.

## QA script

1. Open the preview at 1440px and 390px. Switch Write → Translate → Listen → Publish. The page must stay within the viewport and every control must remain reachable.
2. In Write, enter a new book title and your own text. In Publish, change the cover colour and open the book. Your text must be present. Close it to see the selected cover.
3. Reload, choose **Make it vivid**, and verify the manuscript changes only after **Use this version**. **Undo edit** restores the original.
4. In Translate, switch Svenska, Français and Deutsch. Enter custom writing in Write, then return: prepared translations must be replaced by the explicit sample notice. **Load the sample** restores the example.
5. In Listen, press play, seek, change playback speed and switch languages. Leaving Listen must pause playback. The automated test also exercises a failed recording followed by a working recording.
6. At desktop size with motion enabled, let the guided tour advance. It must never start audio. Interacting stops the tour. Reduced motion disables automatic transitions; the setting can change while the page is open. Arrow keys move between studio tabs.
7. Open `/author#audio` and `/author#writing` directly. They must open the appropriate studio stage. **Get early access** must navigate to `/waitlist`.

## Verification

- Production build: passed.
- ESLint: passed without warnings.
- TypeScript: passed.
- Unit tests: 168 files, 1,710 tests passed.
- UI tests: all 8 passed against the final production build.
- Responsive checks: all four studio modes checked at 320, 390, 768, 1024, 1440 and 1920px; no horizontal overflow. Final light/dark desktop and mobile screenshots also inspected.

## Preview boundaries

Writing edits, translation and narration use clearly labelled prepared examples. Arbitrary visitor text stays in component state and can be previewed as a book; it is not sent to a model or saved after reload. The reader preview does not publish anything. Narration uses existing committed recordings and starts only after pressing Play.
