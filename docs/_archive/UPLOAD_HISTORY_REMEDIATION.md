# Upload History Remediation

## Current State
Tracked upload artifacts under `apps/web/.uploads/` have been removed from the
current tree, but they still exist in git history until the repository history
is rewritten.

## Safe Procedure
1. Freeze merges and notify everyone to stop pushing to the repo.
2. Create a fresh backup mirror:

```bash
git clone --mirror git@github.com:<org>/<repo>.git verkli-web-backup.git
```

3. Install `git-filter-repo` if it is not already available:

```bash
brew install git-filter-repo
```

4. Rewrite history to remove every tracked upload artifact:

```bash
git filter-repo --path-glob 'apps/web/.uploads/**' --invert-paths
```

5. Verify that the path is gone from all refs:

```bash
git log --stat -- 'apps/web/.uploads/**'
git rev-list --objects --all | rg 'apps/web/\.uploads/'
```

6. Force-push the rewritten history and tags:

```bash
git push --force --all
git push --force --tags
```

7. Tell every collaborator to re-clone or hard-reset to the rewritten history.

## Follow-Up
- Invalidate any cached tarballs or mirrors that still expose the old objects.
- If any uploaded files contained personal or customer data, treat this as a
  reportable data-handling incident under your normal security process.
