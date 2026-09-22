# Verkli safety backup — 22 September 2026

This is a backup, not a release. Original branches, worktrees, staging and stash entries were not changed.

- 67 registered worktrees inventoried; five had uncommitted files.
- Working-tree and staged-index states have separate snapshot commits.
- Every local branch/tag tip and detached worktree head is referenced below.
- All 13 stash entries are backed up. Stash 10 is sanitized; its unmodified original stays in the restricted local Git bundle.
- Git-ignored files such as local environment files, dependencies and build caches are excluded.
- Snapshot filenames and commit hashes are listed in `manifest.json`.

## Restore without overwriting ongoing work

1. Find the desired backup ref in `manifest.json`.
2. Fetch it: `git fetch origin refs/heads/codex/backup-20260922/worktree/00-working`.
3. Open it separately: `git worktree add --detach ../verkli-recovered FETCH_HEAD`.

For stash restoration, fetch its backup ref, then use `git stash apply FETCH_HEAD` in a clean disposable checkout. Do not apply over ongoing changes. The separate index snapshots preserve staged versions independently.

No application tests or production deployment were performed for this archival operation. Remote commit equality and local snapshot integrity are verified separately.
