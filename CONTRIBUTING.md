# Contributing

One unit of work per branch, branched from `main`, with its own pull
request.

## Stacked PRs: retarget the child, or delete the base on merge

Sometimes a change genuinely builds on an unmerged one — its code
comments cite a README section the earlier change writes, so it cannot
be reviewed standalone. Stack it: open it with `--base <parent-branch>`
and name the required merge order in the description.

The stack is the easy part. **Landing it is where this repo has lost
work twice.**

A stacked PR keeps pointing at its parent branch after that parent
merges into `main`. The parent branch still exists, still accepts
merges, and is now a dead end — nothing will pull from it again. Merging
the child at that point does exactly what you asked and puts your work
nowhere.

GitHub retargets an open PR to `main` automatically **only when its base
branch is deleted.** So on merging a parent, either:

```bash
gh pr merge <parent> --merge --delete-branch   # children retarget to main
gh pr edit <child> --base main                 # or retarget them yourself
```

**This is not hypothetical.** PRs #47 and #49 were stacked correctly and
then merged into their stale parents. Both merged without conflict, both
report MERGED on GitHub to this day, and neither reached `main`: #47
landed in `feat/affordance-surfacing`, and #49 in `docs/read-scope-audit`
seconds after #48 had already taken that branch to `main`. The
domain-index work sat on an abandoned branch until it was reopened as
#51.

## Check that a merge went where you meant

The failure above is invisible from the PR page — MERGEABLE before,
MERGED after, no conflict, no warning. Two commands show it:

```bash
gh pr list --state merged --json number,headRefName,baseRefName --limit 10
git branch -r --contains <commit>    # is origin/main in the list?
```

`baseRefName` is the field to read. Anything but `main` means the work is
on a feature branch, whatever the merge status says.
