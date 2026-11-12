# Maintaining the personal fork

This fork keeps Ferret's history and architecture. Pull requests target
[`Shotkar/ferret`](https://github.com/Shotkar/ferret)'s `main`; upstream submissions,
merges, image publication and deployment require separate approval.

## Source baseline

The supplied source is release `2026.11.10`, commit
`07ff2e6464f372b61d750962feff7b8b993ac0b0`. All 580 supplied files matched its
release archive byte for byte before local changes. This identifies the supplied
source; the running production image has not been independently inspected.

| Ref | Purpose |
| --- | --- |
| `upstream` | Official `https://github.com/ferret-project/ferret.git`, full history |
| `origin` | Personal `https://github.com/Shotkar/ferret.git`, full history |
| `origin/main` | Fork integration branch; retains the upstream snapshot rather than being reset to the older supplied release |
| `origin/upstream-snapshot/2026-11-11` | Preserved fork starting point, `5f234a1862a678bc0a4cd5f6bb3cb17d31980109` |
| `fix/manual-retrieval` | First fix, developed and baseline-tested from the supplied release |

The feature branch includes initialization commit
`e7204b713a67523fc0fc1cf090701bc0e2fe380f`, which restricts automatic image
publication to the official repository. Fork pull requests still run checks.
Tests on the supplied release do not validate an integration with newer `main`;
review the merge result and its checks separately before building a staging image.

Verify refs before each review, since remote branches move:

```bash
git remote -v
git fetch origin --tags
git fetch upstream --tags
git rev-parse origin/main
git rev-parse origin/upstream-snapshot/2026-11-11
git log --oneline origin/main..fix/manual-retrieval
git diff --stat origin/main...fix/manual-retrieval
```

Do not reset or force-push the integration branch to make its version match a
deployment. Create a branch from the required release or commit instead.

## Custom changes

| Change | Reason / upstream review point |
| --- | --- |
| Fork image-publishing guard in `.github/workflows/ci.yml` | Run checks without publishing custom images automatically; retain when updating workflows |
| `NODE_IMAGE` build argument in `Dockerfile` | Allow digest-pinned test builds while preserving `node:26-bookworm-slim` as the default |
| Phase 1 manual retrieval | Heading/OCR passage selection and scale-removal aliases; budgeted procedural answers, verbatim source warnings, household guards, section citations and readable steps |
| Development documentation and local-file exclusions | Keep test storage, credentials and local tools out of commits and image contexts |

Phase 1 adds no database migration. Recheck the final diff for schema or
migration changes before making that claim for a release.

## Incorporating upstream updates

1. Fetch upstream tags and review the release notes and commit range from the
   currently tested source. Pin the chosen release commit; do not use a moving
   `latest` tag as the test baseline.
2. Create `update/upstream-<release>` from the fork's integration branch. Merge
   the selected upstream tag or commit there, preserving published history.
3. Review each custom change against upstream. Remove a patch only after its
   regression tests pass with the upstream replacement. Resolve conflicts in the
   review branch, with particular attention to ask/search interfaces, model
   limits, citations, workflows, lockfiles and Docker stages.
4. Run type checks, targeted regressions, the full suite and the complete build.
   Record the source SHA, lockfile hash, runtime versions, base-image digest,
   failures and hardware/model acceptance results. See
   [development and staging](docs/development-testing.md).
5. Open a pull request against the fork's `main`. Review the actual merge result
   as well as the branch. Build a separately tagged image and test it against
   isolated storage after approval.
6. Record release notes, retained patches and known conflicts here. Merge,
   publishing and deployment remain separate decisions.

Current integration risks are newer upstream changes to retrieval/answer schemas
and CI workflows. No conflicts have yet been resolved against the newer fork
`main`, and a Linux container acceptance run remains outstanding.
