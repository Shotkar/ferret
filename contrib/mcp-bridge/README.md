# Ferret over stdio

Ferret's MCP server is built in at `/mcp` (Streamable HTTP). Clients that can send a header connect to it directly
([connecting Claude](../../apps/docs/guide/claude.md)). This is for the ones that start a local process and talk to it
over stdio instead — Docker's MCP Toolkit among them: a small bridge that forwards each message to your Ferret with an
API key. It has no dependencies and holds nothing; your inventory stays on your server.

Settings:

| | |
|---|---|
| `FERRET_URL` | Your Ferret's address, e.g. `https://ferret.example.com` (`/mcp` is added) |
| `FERRET_API_KEY` | An API key from Ferret: **Household & settings → Claude & API → New key** (read-only keys work too) |

Run it with Node 26+ or Docker:

```bash
FERRET_URL=https://ferret.example.com FERRET_API_KEY=ferret_… node contrib/mcp-bridge/bridge.mjs

docker build -t ferret-mcp contrib/mcp-bridge
docker run -i --rm -e FERRET_URL=https://ferret.example.com -e FERRET_API_KEY=ferret_… ferret-mcp
```

The container has to be able to reach your Ferret: a server on your own network works when Docker can resolve its
name, and its HTTPS certificate must be one Node trusts (a public one, e.g. through a reverse proxy).
