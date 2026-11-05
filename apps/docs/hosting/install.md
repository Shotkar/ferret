# Install

Ferret runs as one Docker container: the web app, the API, the MCP server for Claude, background jobs, and these docs.
Its data — a SQLite database and the uploaded files, encrypted — lives in one folder.

## What you need

- A machine with **Docker** and Docker Compose — x86-64 or 64-bit ARM (a Raspberry Pi 4 or 5 on a 64-bit OS, an
  Apple Silicon Mac, an ARM server).
- An address people reach it at, ideally **HTTPS** behind a reverse proxy (Traefik, Caddy, nginx). Installing on an
  iPhone, the camera and push notifications all need HTTPS.

## Steps

1. Get `compose.yaml` and `.env.example` from [the repository](https://github.com/ferret-project/ferret) into a folder,
   and copy `.env.example` to `.env`:

   ```bash
   curl -O https://raw.githubusercontent.com/ferret-project/ferret/main/compose.yaml
   curl -o .env https://raw.githubusercontent.com/ferret-project/ferret/main/.env.example
   ```

2. Fill in the three required settings:

   ```bash
   AUTH_SECRET=   # openssl rand -base64 32
   FILES_KEY=     # openssl rand -base64 32
   PUBLIC_URL=https://ferret.example.lan
   ```

   ::: danger FILES_KEY
   Every uploaded photo and document is encrypted with a key sealed by `FILES_KEY`. **Lose it and they're
   unreadable** — backups too. Save it in your password manager now.
   :::

3. Start it:

   ```bash
   docker compose up -d
   ```

4. Open `PUBLIC_URL` and **sign up**: the first account is yours, and it's the [server admin](./server-admin).
5. Turn on what you want from [Settings](./configuration): [backups](./backups) first, then
   [email](./email) (needed for anyone else to join) and the [AI features](./ai).

## Where the image comes from

The same image is published in two places — use whichever you like:

| Registry | Image |
|---|---|
| GitHub | [`ghcr.io/ferret-project/ferret`](https://github.com/ferret-project/ferret/pkgs/container/ferret) |
| Docker Hub | [`ferretproject/ferret`](https://hub.docker.com/r/ferretproject/ferret) |

Both have the same tags: `latest`, each release (`2026.11.2` — see [Upgrading](./upgrading)) and each build
(`sha-…`), for x86-64 and 64-bit ARM. `compose.yaml` uses GitHub's; for Docker Hub, change its `image:` line to
`ferretproject/ferret:${FERRET_TAG:-latest}`. Unraid, Portainer and other tools that ask for an image name take either.

## Behind a reverse proxy

Point the proxy at port **8787**. If the proxy runs on another machine, set `TRUSTED_PROXIES` to its address —
otherwise every visitor looks like the proxy, and they all share one set of sign-in limits. Behind more than one (a
tunnel, then Traefik), list them all: [Tunnels and access proxies](./tunnels).

## Sign-ups

`ALLOW_SIGNUP=true` (the default) lets anyone who can reach Ferret make an account — though everyone after the first must
confirm their email, so that needs [email](./email). Once your household is in, set `ALLOW_SIGNUP=false`: invited
people can still join from their invitation link.
