# Glama's directory check

[Glama](https://glama.ai/mcp/servers) lists MCP servers after building one from a Dockerfile and asking it for its
tools. Ferret's MCP server needs a running Ferret and an API key, so this Dockerfile starts the published image with
throwaway secrets, makes its first account, a household and a key (`start.mjs`), and bridges stdio to `/mcp` so
[mcp-proxy](https://github.com/punkpeye/mcp-proxy) can serve it the way Glama expects. The household is empty and
nothing in it outlives the container.

It's for that check only. To run Ferret, use the main image and `compose.yaml` ([installing](../../apps/docs/hosting/install.md)).

On Glama, the server's **Configuration** builds from source instead (it writes its own Dockerfile); `start.mjs` finds
the server either way and brings its own throwaway settings, so no environment variables are needed:

- Base image `debian:bookworm-slim`, Node.js `26` (Ferret needs 26+), Python left as it is
- Build steps: `pnpm install --frozen-lockfile`, `pnpm --filter @ferret/server build` (Glama's image brings pnpm and
  mcp-proxy; pnpm switches to the version in package.json by itself)
- Command: `mcp-proxy node contrib/glama/start.mjs`

Try it locally:

```bash
docker build -f contrib/glama/Dockerfile -t ferret-glama .
docker run --rm -p 8080:8080 ferret-glama   # MCP at http://localhost:8080/mcp (and /sse)
```
