# Illustration candidate picker

The new `/author/illustrations` page lets approved authors choose an active owned book, its edition and an active chapter, then open the private image-candidate page. It uses existing books/book_versions/chapters metadata only. No manuscript text, image bytes, writes, schemas, policies, dependencies or central editor/navigation files are changed.

Every server navigation authenticates the author again. A browser session boundary hides private titles until the same owner is verified and hides them on cross-tab signout or account change. Selected book ownership and tombstone state are checked before edition lookup; the edition/book relation is checked before chapter lookup. Searches escape LIKE metacharacters, query input is bounded, and each list reads 21 rows to expose 20 plus a next-page link. Book and chapter searches reset pagination. Errors are distinct from empty lists and log only the feature prefix/code/status.

The production entry remains a direct `/author/illustrations` URL until the shared navigation owner integrates its link. This page does not activate unverified storage. The downstream candidate service retains its schema/private-bucket readiness checks and separate live-policy verification requirements.

## Local QA — synthetic data

Start on port 3073 with the same placeholder-only public configuration used by the candidate demo. Open `http://localhost:3073/dev/illustration-picker`. This route uses synthetic metadata and local image URLs; no database/storage/provider is contacted. It is excluded outside development.

1. Verify the synthetic-data notice and first 20 book cards. Use Next page and Previous page; search by title and verify the result returns to page 1.
2. Open Empty notebook and verify the “no editions” state. Return via Your books.
3. Choose The harbour → EN → Across the water. Verify the exact chapter title and the simulated-saving notice. Choose a synthetic image, complete its descriptions, and save a candidate.
4. Return to chapters, choose the book breadcrumb, then SV → At the harbour. Verify the previous edition's proposal/candidates are absent and the new chapter title is correct.
5. Return to SV chapter selection, paginate and search for Island chapter 22. Search for a missing title and check the explicit empty state and Clear search action.
6. Repeat at 390px width. Check readable cards, breadcrumbs, search, pagination and buttons without horizontal overflow. Reloading/leaving a selected demo chapter clears its temporary images.

## Evidence boundary

Scoped unit tests cover query validation, owner/tombstone/edition guards, pagination/search filters, metadata-only projections, error sanitization, author admission and production fixture exclusion. Browser tests use memory-only data on desktop/mobile. These do not verify live data access, live persistence or deployed policy parity. Full lint/TypeScript/build/test results must be tied to the exact reviewed commit through the coordinated CI pipeline; production-server 404 is a separate runtime check.
