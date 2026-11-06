# Installing Ferret's MCP server (for AI agents)

Ferret is a self-hosted home inventory. Its MCP server is **built into the Ferret server** at `/mcp` (Streamable HTTP),
so there is nothing to install on this machine: you connect to the user's own Ferret with an API key.

## 1. Ask the user for two things

1. **Their Ferret's address**, for example `https://ferret.example.com` or `http://192.168.1.10:8787`. The MCP endpoint
   is that address followed by `/mcp`.
   - No Ferret yet? It runs as one Docker container — see
     [Install](https://github.com/ferret-project/ferret/blob/main/apps/docs/hosting/install.md). Don't install a server
     for them unless they ask.
2. **An API key** (it starts with `ferret_`). They make it in Ferret: **Household & settings → Claude & API → New key**.
   A key belongs to one household. A **read-only** key can search and ask but not change anything; suggest it if they
   only want lookups.

Never invent either value, and don't write the key anywhere but the MCP settings.

## 2. Add the server

Cline (`cline_mcp_settings.json`) — a remote server with a header:

```json
{
  "mcpServers": {
    "ferret": {
      "type": "streamableHttp",
      "url": "https://ferret.example.com/mcp",
      "headers": { "Authorization": "Bearer ferret_…" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Other clients take the same URL and header (`X-API-Key: ferret_…` works too). A client that can only start a local
program over stdio can use the bridge in [`contrib/mcp-bridge`](contrib/mcp-bridge) (Node 26+, no dependencies):

```json
{
  "mcpServers": {
    "ferret": {
      "command": "node",
      "args": ["/path/to/ferret/contrib/mcp-bridge/bridge.mjs"],
      "env": { "FERRET_URL": "https://ferret.example.com", "FERRET_API_KEY": "ferret_…" }
    }
  }
}
```

## 3. Check it works

Call `what_needs_attention` (read-only, safe on any household) or `search_inventory` with a word like `drill`. An empty
inventory answers with nothing — that's fine.

If it fails:

- **401**: the key is wrong, revoked or expired — ask for a new one.
- **403 on a change**: the key is read-only (or the person is a viewer in that household).
- **Can't connect / certificate errors**: the address must be reachable from this machine; a Ferret on a LAN with its
  own certificate may need `NODE_EXTRA_CA_CERTS` for Node-based clients, or use its `http://` LAN address.

## What it can do

Search and ask about the inventory (`search_inventory`, `ask_inventory`), look at items, places, warranties,
maintenance, loans and the shopping list, and — with a key that may write — add and update items, photos, warranties,
claims, maintenance and stock. Every tool describes itself; the full guide is
[Connecting Claude](https://github.com/ferret-project/ferret/blob/main/apps/docs/guide/claude.md).
