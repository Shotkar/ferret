# Development, baseline checks and isolated staging

## Reproduce the source baseline

For the original baseline, use the supplied `2026.11.10` source commit
`07ff2e6464f372b61d750962feff7b8b993ac0b0`. The dependency lockfile is unchanged:

```text
pnpm-lock.yaml SHA256
d951fe9197b7ebe0e3054eebdc1f94377f745fa1cb99470356855b010cb62700
```

The release-based fix is preserved as `release/manual-retrieval-2026.11.10` at
`03765b8d19d484b38169fa638ca419e97073641a`. The PR branch was subsequently
rebased onto the unchanged fork `main` (`5f234a1`) for a separate compatibility
check. That upstream revision already has a different lockfile; the PR does not
change it relative to its base:

```text
PR integration pnpm-lock.yaml SHA256
5f0e63c42b68262bb9f4308662c90f2c83d19013b66626314693002dde1df366
```

Install Node 26 and the `packageManager` version in `package.json`, then run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Use synthetic fixtures. Keep real manuals, inventory exports, databases, keys,
model responses containing private text, `.env` files and backups outside Git.
The tests do not require access to production Ollama, Qdrant or Docling.

### Recorded Windows baseline, 11 November 2026

The local portable runtime was Node **26.13.0**, with pnpm **10.28.0**. Downloads
were checked against the official Node checksum and pnpm registry integrity.
Sources: [Node distribution](https://nodejs.org/dist/v26.13.0/) and
[pnpm registry package](https://registry.npmjs.org/pnpm/10.28.0).

```text
node-v26.13.0-win-x64.zip SHA256
dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a
node.exe SHA256
14319838b3f355e0398c13569a90270bce4fc68f25189f58c59b03dadae0e6d5
pnpm-10.28.0.tgz SHA256
9b0b04e6e79945566917f8411bb6f65fd2f3e1590426904e8500e1acc4b33561
```

| Check before application changes | Result |
| --- | --- |
| Frozen-lockfile dependency installation | Passed; 414 packages |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed for web, docs and server; web bundle-size warning |
| Full tests with UTC and workspace-local temporary storage | 400 passed, 8 failed, 5 skipped; 74 files |
| Isolated sign-in guard rerun | 3 passed |

The full-suite failures were six backup/snapshot tests reporting Windows `EBUSY`
when removing a just-closed libSQL file, a Unix file-mode assertion in
`secrets.test.ts` (`0600` expected, Windows `0666` observed), and one 60-second
sign-in guard timeout. That sign-in test passed in isolation. These results do
not establish that Linux deployment tests pass.

The first sandbox run also hit a `#!sandbox` temporary-path URL fragment, denied
loopback test connections and a host-timezone date assertion (397 passed,
11 failed, 5 skipped). The normalized run used UTC, a temporary directory inside
the workspace and permission for local test networking. VitePress needed
permission to create its workspace-local Vue junction. Do not fix unrelated
application behavior merely to hide these environment differences.

Portable tools and private logs live under ignored `.local-tools/`; the package
store is `.pnpm-store/`. On this Windows checkout, put
`.local-tools/node-v26.13.0-win-x64` and `.local-tools` first on `PATH`, then use
`.local-tools/pnpm.cmd`. The Windows install also used
`--store-dir .pnpm-store --package-import-method copy`. Set `TZ=UTC` and
`TEMP`/`TMP` to a workspace-local
directory for comparable checks. The exact records are in
`.local-tools/baseline/toolchain.json` and `summary.json`; those local paths are
not required on other machines.

## Build an isolated test image

Docker was unavailable during the Windows baseline. **No custom image has been
built or tested.** The Dockerfile keeps its existing default base image and now
accepts `NODE_IMAGE` for all three stages.

A read-only query of the official Node registry on 11 November 2026 returned
this candidate multi-platform base:

```text
node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
Linux amd64 manifest: sha256:51d24d08800f352afae68628d883e63db3f2c4dd807b7ddb6f805dc6b9ef8c0e
```

This is a registry candidate, not a validated Ferret build. Recheck availability
and record the digest actually used. Example on a Linux amd64 Docker host:

```bash
SOURCE_SHA="$(git rev-parse HEAD)"
NODE_IMAGE='node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68'
export FERRET_TEST_IMAGE="ferret-local:manual-retrieval-${SOURCE_SHA:0:12}"
docker build --pull --platform linux/amd64 \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg FERRET_VERSION="$(scripts/version.sh)-manual-retrieval-${SOURCE_SHA:0:12}" \
  --label org.opencontainers.image.revision="$SOURCE_SHA" \
  --tag "$FERRET_TEST_IMAGE" .
docker image inspect "$FERRET_TEST_IMAGE" --format '{{.Id}}'
```

Save the source SHA, clean/dirty diff status, lockfile SHA256, base digest,
build log and resulting image ID together. The existing build installs Corepack
from npm; also record its resolved version from the build environment. Keep
local tools, package caches and `.staging/` excluded from the Docker context.
This command builds locally; it does not publish an image.

## Staging with separate data

The following is a manual test setup for a later approved staging run. It has
not been started. Create `.staging/data` and `.staging/backups`, writable by the
container's uid 1000. Keep all staging files under ignored `.staging/`.

Save this as `.staging/compose.yaml`:

```yaml
name: ferret-manual-staging
services:
  ferret:
    image: ${FERRET_TEST_IMAGE:?Set FERRET_TEST_IMAGE to the local test tag}
    container_name: ferret-manual-staging
    env_file: ./ferret.env
    ports:
      - "127.0.0.1:18787:8787"
    volumes:
      - ./data:/data
      - ./backups:/backups
```

Save this minimal environment as `.staging/ferret.env`:

```dotenv
PUBLIC_URL=http://localhost:18787
DATA_DIR=/data
BACKUP_DIR=/backups
TZ=Pacific/Auckland
ALLOW_SIGNUP=true
```

A fresh data directory makes independent secrets on first start. AI, mail and
other integrations remain disabled because their settings are absent. Do not
copy production secrets, storage mounts or environment files into this setup.
If AI is enabled for acceptance testing, use explicit staging settings and a
dedicated Qdrant collection; verify its name before allowing indexing. Keep
Docling, Ollama and Qdrant private to their trusted network.

After approval, start and inspect the staging container:

```bash
docker compose -f .staging/compose.yaml up -d
docker inspect ferret-manual-staging --format '{{.State.Health.Status}}'
curl --fail http://localhost:18787/healthz
```

The image's health check calls `/healthz`; it does not prove conversion,
retrieval, AI answering or vector indexing works. Create a disposable household
and upload a private copy of the manual. Check the full ordered procedure,
warnings, rinsing/cleanup, original attachment citation and missing-symbol
notice against the PDF. Also test cleaning, unrelated questions, a small
receipt, warranty questions and a second household. Never infer PDF pages from
Markdown line numbers. Record the model, context/output settings, latency and
final answer, with private evidence kept outside Git.

## Backups, rollback and upgrades

Phase 1 is intended to avoid schema changes. Inspect the final migration and
schema diff anyway; a later upstream update may migrate the database on start.
An older image alone may not reverse that migration.

Before any approved deployment, retain the exact current image ID/tag, a
checked consistent backup, its matching encryption secrets or recoverable key
file, and the configuration needed to restore it. Test restoration into a new
isolated directory. Ferret's [backup commands](../apps/docs/hosting/backups.md)
can check and restore a named snapshot; they must use the secrets that belong
to that snapshot. Keep backup storage separate from application storage.

If a staging test fails, stop that staging container and retain its logs. Restore
the checked pre-test data into a separate empty directory, then start the
matching pre-test image against that restored data. Verify health, sign-in and
sample attachment decryption before accepting the restoration. Do not overwrite
the only copy of failed data or try an older image against a migrated database
without a verified compatibility plan.

Production upgrades, merges and image publication require manual sign-off.
Follow [the upstream process](../UPSTREAM.md), validate the actual integration
commit and repeat Linux/container acceptance before choosing a deployment.
