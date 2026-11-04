# Ferret for Heimdall

An enhanced app for the [Heimdall](https://heimdall.site) dashboard: Ferret's tile shows how many things you have and
how many need attention, from `GET /api/v1/summary`. Setting it up:
[Home dashboards](../../apps/docs/hosting/dashboards.md) in the help.

Until it's in Heimdall's own list of apps, add it to your Heimdall by hand (linuxserver's image; `heimdall` is the
container's name):

```sh
docker cp Ferret heimdall:/config/www/SupportedApps/Ferret
docker exec heimdall php /app/www/artisan register:app Ferret
```

Then in Heimdall: **Add an application**, choose **Ferret**, fill in its address, turn on the config and give it an
API key. **Upload `Ferret/ferret.svg` as its icon** — Heimdall fetches the default icon from its own address when you
save, and refuses local addresses, so a hand-added app won't save without it.

After changing these files in a running Heimdall, restart its container (PHP keeps the old code cached).
