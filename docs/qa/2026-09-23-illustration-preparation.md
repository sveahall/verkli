# Local illustration preparation

`/author/illustrations/prepare` gives approved authors a local crop preview and real PNG/JPEG downloads. It does not upload, attach or save an illustration in a book. Original proportions, square, landscape 3:2 and portrait 2:3 share one preview/export crop calculation. Zoom and position stay within the source. Output is capped at 1600 pixels per side without enlargement; this does not guarantee print-provider requirements.

PNG retains transparency; JPEG flattens onto white. Inputs are bounded to 10 MiB, 40 megapixels and 20,000 pixels per side, with PNG/JPEG header validation before browser decoding. Animated PNG is rejected. JPEG orientation uses browser decoding without a second rotation. Failed replacement preserves the current image and crop. File changes abort old work, late responses are ignored, and object URLs are released. Account changes unmount the local workspace.

The development entry `/dev/illustration-preparation` uses the same actual local tool and is unavailable outside development. No fixture database or provider is involved. Start a single dev server only during the coordinated UI slot, with public placeholder configuration, using port 3074. Never claim these tests verify authenticated live data or production runtime routing.

## Manual QA — six steps

1. Open `http://localhost:3074/dev/illustration-preparation` at desktop width and 390px. Verify the empty state, disabled download, local-only notice and no horizontal scrolling.
2. Select a two-colour PNG. Choose square, change horizontal/vertical position and zoom, and reset. Download PNG; inspect the actual file dimensions and visible crop against the preview, not just the button response.
3. Select a transparent PNG. Download PNG and confirm transparency; choose JPEG and confirm an opaque white background, correct file signature and dimensions.
4. Try unsupported, broken and oversized images. Confirm an actionable error and that the earlier valid image/crop remain available. Simulate an encoding failure and retry the download without resetting the crop.
5. Select an EXIF-rotated JPEG and verify preview/download orientation. Select a replacement while the previous image is still decoding; confirm only the latest selection appears and exports.
6. In the authenticated entry, sign out or switch accounts in another tab. Confirm the tool clears. Reload the demo and confirm local work is gone while previously downloaded files remain on the device.

## Automated checks

Scoped Vitest covers crop geometry/bounds, headers, decoded dimensions, cancellation, URL disposal, encoder errors and author/dev route admission. Playwright checks real downloaded image bytes, pixels and dimensions, PNG transparency, JPEG white background and orientation, replacement/encoding failure, late decoding and responsive layout.

Run from `apps/web`: `npx vitest run src/features/illustration-preparation 'src/app/(app-author)/author/illustrations/prepare/page.test.tsx' src/app/dev/illustration-preparation/page.test.tsx --maxWorkers=1`, then `npx playwright test --config playwright.illustration-preparation.config.ts`. Full lint/types/build/test belongs to exact-head CI under release coordination. No central navigation, schema, dependency, manuscript or existing candidate flow is changed.
