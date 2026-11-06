# Claude and the API

## Claude

Ferret speaks **MCP**, so Claude can look things up and keep your inventory up to date for you: *"where did we put the
tent?"*, *"add the new blender, it was $89 at Target"*, *"what maintenance is due this month?"*, *"we used the last
furnace filter"*.

1. **Household & settings → Claude & API → New key.** Name it, choose whether it's **read-only** (can look and ask, but
   not change anything) and when it expires.
2. Copy the key straight away — Ferret only shows it once.
3. Connect Claude Code with the command shown there:

   ```bash
   claude mcp add --transport http ferret https://ferret.example.lan/mcp --header "Authorization: Bearer ferret_…"
   ```

A key works for one household, acts as you, and can be revoked any time from the same page.

### Other MCP clients

Ferret's MCP server is at `/mcp` on your Ferret's address (Streamable HTTP). Clients that can send a header take the
address and the key — as `Authorization: Bearer ferret_…` or `X-API-Key: ferret_…`:

```json
{
  "mcpServers": {
    "ferret": {
      "type": "http",
      "url": "https://ferret.example.lan/mcp",
      "headers": { "Authorization": "Bearer ferret_…" }
    }
  }
}
```

Clients that only start a local program and talk to it over stdio — Docker's MCP Toolkit, desktop apps' config files —
can use the small bridge in
[`contrib/mcp-bridge`](https://github.com/ferret-project/ferret/tree/main/contrib/mcp-bridge): it runs with Node or
Docker, takes `FERRET_URL` and `FERRET_API_KEY`, and forwards each message to your Ferret. It holds nothing itself.

Ferret is listed in the [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.ferret-project/ferret`,
so directories built on it can find it; you fill in your Ferret's address and a key.

On a hosted Ferret, API keys (Claude and scripts) may come with some plans only — see [Plan and usage](./plan-and-usage).

## The API

Scripts can use the same key with the REST API at `/api/v1`. The [API reference](/../#/api){target="_self"} (also linked from that
page) lists every endpoint, with a ready-to-copy request in curl, JavaScript or Python and what comes back; find one by
typing part of its name. A few things — managing keys, your sign-in security, [Download everything](./download-everything),
backups — need a real sign-in, not a key.

The API is also described as **OpenAPI 3.1** at `/api/v1/openapi.json` (with a key, or signed in) — import it into
Postman, Bruno or Insomnia, or generate a client from it.

## Other ways to connect

| To… | Use |
| --- | --- |
| Show counts on a home dashboard (Heimdall, Homepage) | `GET /api/v1/summary` — [Home dashboards](../hosting/dashboards) |
| Get maintenance in a calendar app | the calendar feed — [Reminders](./reminders#calendar) |
| Send reminders to ntfy, Pushover, Telegram… | [Other apps](./reminders#other-apps) |
| Bring in devices and rooms from Home Assistant | [Importing](./importing#home-assistant) |
| Load or move things in bulk | a spreadsheet, [importing](./importing#a-spreadsheet-csv) and the [insurance report's CSV](./insurance-report) |
| Take everything with you | [Download everything](./download-everything): JSON, CSV and the files |
