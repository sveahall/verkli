# Book production: cover, book structure, and print files

Extend the author Cover workspace with a complete paperback production view. Keep the existing front-cover tools and AI conversation; introduce a full wrap (back, spine, front), optional front/back matter, trim and typesetting controls, an actual paginated interior, and explicit export checks.

## Implementation

1. Shared validated edition settings, ISBN checksum and exact cover geometry. Never infer a final spine from word count.
2. Responsive production workspace: cover spread with front/back uploads, live dimensions, book-part ordering and enabled states, format controls, saved/error states, proof/export review. Use the approved Verkli tokens and keyboard-accessible controls.
3. Private edition-scoped persistence and artwork storage, **pending schema approval**. Existing books JSON is publicly readable for published books, so it cannot hold unpublished front matter. Verify author/book/version ownership and revision conflicts.
4. PDF export with bundled fonts, actual pagination and contents, **pending PDFKit dependency approval**. Preserve supported manuscript formatting; explicitly reject unsupported content rather than silently dropping it. Render separate interior and full-wrap PDFs. Printer-specific colour profiles, hardback cases and dust jackets are separate specifications; no universal printer certification.
5. Validate geometry, private access, save/reload/conflicts, generated PDF pages/text/fonts, desktop/mobile UI and existing app checks. Review before authorized deployment.

## Product boundaries

- Initial binding: perfect-bound paperback, editable printer measurements. Printer selection is pending; default to an independent printer handoff if unanswered.
- Original manuscript chapters remain in the writing editor. Optional title/copyright/contents/dedication/foreword/preface and afterword/acknowledgements/bibliography/author biography surround them.
- No automatic printing orders, invented ISBN assignments, publication, or payment changes.
- A proof is distinct from printer approval. Final spine dimensions depend on actual extent, paper and the chosen printer. Artwork needs adequate effective resolution; exports must list unresolved issues.
- Existing cover editor only exports 800 × 1200 px; print artwork must preserve higher-resolution originals.

## References checked

- KDP paperback cover requirements: https://kdp.amazon.com/en_US/help/topic/G201953020
- BoD cover calculator: https://www.bod.se/hjalp/omslagsberaknare
- PDFKit text/fonts: https://pdfkit.org/docs/text.html

## Current local UI verification

Available now: `http://localhost:3067/dev/book-production`. Synthetic manuscript only; local browser storage. No database changes, artwork storage service or PDF generation.

1. Switch Front / Back / Full wrap, then change the back-cover text.
2. Add a foreword, move it, disable/re-enable it and verify the contents preview.
3. Change trim, bleed and spine; compare the dimensions.
4. Simulate a save failure, recover, save locally and reload.
5. Check 390/1440 px, both themes and keyboard tabs.

## Production integration candidate

The authenticated book editor now exposes **Cover → Print & book layout**. Owner identity comes from the existing server-authorized book record; browser draft keys include owner, book and active edition. The dev fixture remains unavailable in production.

This release deliberately includes browser-local saving only, labelled at the top of the studio. Unsaved/incomplete edits survive client-side navigation in memory, with unload protection outside Cover. Interrupted image reads are cancelled on unmount, retain previous artwork and show a recovery message. A successful save or explicit keep-previous-artwork action clears that message.

No dependencies, database schema, cloud storage, print ordering or PDF exports are introduced. PDF generation and private account sync remain separate work requiring the pending approvals above.

Integration fixture: `http://localhost:3067/dev/book-production?workspace=1&layout=print`.

## Future PDF acceptance (pending approval)

1. Open Cover → Print & book layout; switch front/back/spread and upload separate artwork.
2. Add a foreword and author biography, change order, disable a part and inspect the contents list.
3. Change trim, bleed and printer spine measurement; inspect the full-wrap dimensions.
4. Save, reload and verify the correct edition; interrupt a save and confirm drafts survive with a useful error.
5. Generate and inspect the interior and cover PDFs; compare page count, contents entries and physical dimensions.
6. Repeat essential controls at 390/1440 px, light/dark, keyboard and reduced motion.
