# Home dashboards

Ferret can show a few numbers on your home dashboard — how many things you have, what they're worth, how many need
attention, and what's on the shopping list. Dashboards ask `GET /api/v1/summary` with an
[API key](../guide/claude#the-api); it answers counts and the total only, never what anything is or where:

```json
{ "household": "Our house", "things": 412, "valueCents": 3864500, "currency": "USD", "needsAttention": 3, "urgent": 1, "toBuy": 2 }
```

Make a **read-only** key for it (Settings → Claude & API), bound to the household you want to see. `needsAttention`
is everything in the bell; `urgent` is the part of it that's due or overdue.

## Heimdall

Ferret's [Heimdall](https://heimdall.site) app shows **Things** and **Attention** (everything in the bell) on its tile.

1. Until Heimdall lists Ferret itself, add the app by hand: copy `contrib/heimdall/Ferret` from Ferret's repository
   into Heimdall (linuxserver's image, a container called `heimdall`):

   ```sh
   docker cp Ferret heimdall:/config/www/SupportedApps/Ferret
   docker exec heimdall php /app/www/artisan register:app Ferret
   ```

2. In Heimdall, **Add an application** → **Ferret**. **URL**: Ferret's address (`https://ferret.example.lan/`);
   turn on the config and give it the **API key**; **Test** says whether it got through. While the app is added by
   hand, also **Upload an icon** (`ferret.svg` from the same folder) — Heimdall won't save it otherwise.
3. If Ferret's certificate is from your own authority, turn on Heimdall's Settings → *Skip TLS verification*, or
   give Heimdall's container your authority's certificate.

## Homepage

[Homepage](https://gethomepage.dev)'s `customapi` widget reads the same summary:

```yaml
- Ferret:
    href: https://ferret.example.lan
    icon: ferret.png
    widget:
      type: customapi
      url: https://ferret.example.lan/api/v1/summary
      headers:
        X-Api-Key: ferret_…
      mappings:
        - field: things
          label: Things
          format: number
        - field: valueCents
          label: Value
          format: number
          scale: 0.01
          prefix: $
        - field: needsAttention
          label: Attention
          format: number
```

`icon: ferret.png` is Ferret's icon from [Dashboard Icons](https://dashboardicons.com), which Homepage finds by name
(`ferret.svg` works too).

Any other dashboard that can read JSON with a header (Homarr, Dashy, Glance…) works the same way: the address, and
`X-Api-Key` (or `Authorization: Bearer`) with the key. Most of them can use the same icon, as `ferret` from Dashboard
Icons or straight from `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/ferret.svg`.
