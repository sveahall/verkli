# Verkli safety backup — 22 September 2026

Safety snapshots only, not a release. Original worktrees, branch tips, staging and stash entries were left unchanged.

- 67 registered worktrees inventoried; five had uncommitted files.
- Separate working-file and staged-index snapshots preserve intermediate states.
- All local branch/tag tips and detached worktree heads are referenced in `manifest.json`.
- All 13 stash entries are covered. Stash 10 has potential credentials removed. Stash 00 has its 283 MB model stored separately through Git LFS.
- Original unmodified stash data and all Git history also exist in a verified restricted local bundle.
- Ignored files such as local env files, dependencies and build caches are excluded.

## Main working-copy backup

[Open root snapshot](https://github.com/sveahall/verkli/tree/codex/backup-20260922/worktree/00-working)

## Restore without overwriting ongoing work

1. Choose a backup ref from `manifest.json`.
2. Fetch, for example: `git fetch origin refs/heads/codex/backup-20260922/worktree/00-working`.
3. Open separately: `git worktree add --detach ../verkli-recovered FETCH_HEAD`.

To recover a stash, fetch its backup ref and use `git stash apply FETCH_HEAD` in a clean disposable checkout. Stash 00 uses `stash/00-portable`; stash 10 uses `stash/10-sanitized`.

For the model removed from stash 00: fetch `refs/heads/codex/backup-20260922/large-model` and check out in a separate worktree with Git LFS installed. Run `git lfs pull` there. Its `model.bin` is the exact original file for `apps/web/models/en_sv/model.bin`; size and SHA-256 are in the model branch README and manifest.

No application tests or deployment were performed for this backup operation. Verification covers snapshot integrity, secret scanning and remote commit equality, not production readiness.
