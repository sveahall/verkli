# Manual QA Checklist - Verkli-Web

Use this checklist to verify role isolation, security boundaries, and UX improvements after the security audit fixes.

---

## P0: Role Isolation Security Tests

### Test 1: Reader Cannot See "Switch to Author" Button
- [ ] Sign in as a **reader** account (created with role: reader at signup)
- [ ] Navigate to /reader/home
- [ ] Click user profile menu (top right)
- [ ] **VERIFY**: "Switch to Author" button is NOT visible
- [ ] **VERIFY**: Only Profile, Settings, Feedback, and Sign out are shown

### Test 2: Reader Cannot Access /author/* Routes via Direct URL
- [ ] Sign in as a **reader** account
- [ ] Manually navigate to `/author/home`
- [ ] **VERIFY**: Redirected to `/reader/home?error=author_required`
- [ ] **VERIFY**: Blue info banner shows "Author access required" message
- [ ] Manually navigate to `/author/books`
- [ ] **VERIFY**: Same redirect behavior
- [ ] Manually navigate to `/author/books/[any-uuid]`
- [ ] **VERIFY**: Same redirect behavior

### Test 3: Author Can Switch Between Modes
- [ ] Sign in as an **author** account
- [ ] Navigate to /author/home
- [ ] Click user profile menu
- [ ] **VERIFY**: "Switch to Reader" button IS visible
- [ ] Click "Switch to Reader"
- [ ] **VERIFY**: Redirected to /reader/home
- [ ] **VERIFY**: Now in reader mode
- [ ] Click user profile menu
- [ ] **VERIFY**: "Switch to Author" button IS visible
- [ ] Click "Switch to Author"
- [ ] **VERIFY**: Redirected to /author/home

### Test 4: API Route Protection
- [ ] Sign in as a **reader** account
- [ ] Open browser dev tools, Network tab
- [ ] Attempt to POST to `/api/books` (e.g., via fetch in console)
- [ ] **VERIFY**: Returns 403 Forbidden with "Author account required"
- [ ] Attempt to POST to `/api/ai/text-to-video`
- [ ] **VERIFY**: Returns 401 or 403 (not 400 for missing params)

### Test 5: Role Switch API Security
- [ ] Sign in as a **reader** account
- [ ] In console, run: `fetch('/api/auth/active-role', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({role:'author'})}).then(r=>r.json())`
- [ ] **VERIFY**: Returns error about reader accounts cannot access author features

---

## P1: UX Improvements Tests

### Test 6: Toast System
- [ ] Sign in as an author
- [ ] Navigate to /author/books
- [ ] Delete a book (if one exists)
- [ ] **VERIFY**: Confirmation modal appears with book title
- [ ] Confirm deletion
- [ ] **VERIFY**: Green success toast appears top-right saying book deleted
- [ ] **VERIFY**: Toast auto-dismisses after ~4 seconds

### Test 7: Error Banner on Reader Home
- [ ] Navigate to `/reader/home?error=author_required`
- [ ] **VERIFY**: Blue info banner shows with correct title and description
- [ ] **VERIFY**: "Create author account" link visible
- [ ] Click dismiss (X) button
- [ ] **VERIFY**: Banner disappears
- [ ] **VERIFY**: URL error param is cleaned up

### Test 8: Empty State for Books
- [ ] Sign in as an author with no books
- [ ] Navigate to /author/books
- [ ] **VERIFY**: Shows "Your bookshelf awaits" empty state
- [ ] **VERIFY**: "Create your first book" CTA button visible
- [ ] Click the CTA
- [ ] **VERIFY**: Create book dialog opens

### Test 9: Delete Book Confirmation
- [ ] Sign in as an author with at least one book
- [ ] Navigate to /author/books
- [ ] Hover over a book row
- [ ] Click the trash icon
- [ ] **VERIFY**: Modal appears with book title quoted
- [ ] **VERIFY**: Warning about permanent deletion visible
- [ ] **VERIFY**: "This action cannot be undone" in red
- [ ] Click Cancel
- [ ] **VERIFY**: Modal closes, book not deleted
- [ ] Open modal again and click Delete
- [ ] **VERIFY**: Shows "Deleting..." state
- [ ] **VERIFY**: Success toast after deletion

---

## Regression Tests

### Test 10: Author Core Flows Still Work
- [ ] Sign in as author
- [ ] Create new book via dialog
- [ ] **VERIFY**: Book created, redirected to editor
- [ ] Add content to a chapter
- [ ] **VERIFY**: Content saves (check "Saved" indicator)
- [ ] Navigate back to /author/books
- [ ] **VERIFY**: New book appears in list

### Test 11: Reader Core Flows Still Work
- [ ] Sign in as reader
- [ ] Navigate to /reader/discover
- [ ] **VERIFY**: Published books visible (if any)
- [ ] Navigate to /reader/home
- [ ] **VERIFY**: Page loads without errors
- [ ] Navigate to /reader/library
- [ ] **VERIFY**: Page loads without errors

### Test 12: Import/Translate/TTS Not Broken
- [ ] Sign in as author
- [ ] Open an existing book
- [ ] **VERIFY**: Translate button visible (may be disabled if no content)
- [ ] **VERIFY**: TTS section visible (if feature enabled)
- [ ] **VERIFY**: No JS errors in console

### Test 13: Theme Toggle Works
- [ ] On any page, click theme toggle (bottom right)
- [ ] **VERIFY**: Theme switches between light and dark
- [ ] Refresh page
- [ ] **VERIFY**: Theme preference persists

---

## Security Verification Checklist

| Check | Status |
|-------|--------|
| Reader cannot see "Switch to Author" | [ ] Pass |
| Reader redirected from /author/* routes | [ ] Pass |
| Reader gets 403 on author API routes | [ ] Pass |
| Author can switch between modes | [ ] Pass |
| Role switch API blocks reader→author | [ ] Pass |
| profiles.role not overwritten on mode switch | [ ] Pass |
| text-to-video API requires auth | [ ] Pass |

---

## Files Modified in This Audit

1. `components/navbar/UserMenu.tsx` - Hide switch button for readers
2. `components/navbar/GlobalNavbar.tsx` - Pass originalRole prop
3. `app/api/ai/text-to-video/route.ts` - Add auth check
4. `features/auth/roles.ts` - Don't overwrite profiles.role
5. `components/ui/Toast.tsx` - Already existed, used in DeleteBookButton
6. `components/books/DeleteBookButton.tsx` - Add trash icon, use toast
7. `components/ui/ErrorBanner.tsx` - Handle unknown error codes
8. `components/ui/Skeleton.tsx` - New skeleton component
9. `app/(app-author)/author/books/BooksListClient.tsx` - Better empty state
10. `app/(app-author)/author/books/CreateBookEntry.tsx` - Add data attribute

---

## Notes

- All tests should be performed in both light and dark mode
- Test on mobile viewport as well as desktop
- Clear localStorage/cookies between role tests to ensure fresh state
- Database should have test data with at least one published book for reader tests
