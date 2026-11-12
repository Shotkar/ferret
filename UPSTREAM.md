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
| `release/manual-retrieval-2026.11.10` | Published commit `ba912a2683efc20812769b52474628dbdca5b97b`, with the identical tree to locally tested `03765b8`; use this to avoid an upstream upgrade |
| `fix/manual-retrieval` | PR integration branch, rebased onto the fork's unchanged `main` at `5f234a1` after the release-based patch was tested |

The release branch includes initialization commit
`e7204b713a67523fc0fc1cf090701bc0e2fe380f`, which restricts automatic image
publication to the official repository. The PR retains that guard. Fork pull
requests run checks when Actions is enabled. Newer upstream currency/locale and
question-language changes were retained during the separate compatibility step.
Neither branch has been merged or deployed. The PR diff contains the custom
patch, not an upstream upgrade. Deploying newer `main` to a release-based
production installation would still be an upgrade and needs its own sign-off.

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
| Fork publishing guards in `.github/workflows/ci.yml` | Run checks without publishing images or writing upstream translation catalogs; retain when updating workflows |
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

Four compatibility conflicts in ask/context/inventory/MCP code were resolved on
the unpublished PR branch. Review those areas and CI workflows on future updates.
The Linux container and real-manual acceptance runs remain outstanding.

Linux source validation passed in [PR CI run 43196296588](https://github.com/Shotkar/ferret/actions/runs/43196296588):
frozen install, type checks, full tests (474 passed, 1 skipped) and build. Image
and translation publication jobs were skipped. This validates source builds,
not a Docker runtime or the private De'Longhi manual.
