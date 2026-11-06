# Ferret for Portainer

`template.json` is a Portainer app template (format v3) for Ferret: one container, its data in a volume at `/data`, and
the address to open it at. Ferret makes its own secrets the first time it starts.

In Portainer: **Settings → App Templates → URL**, set to

```
https://raw.githubusercontent.com/ferret-project/ferret/main/contrib/portainer/template.json
```

then **App Templates → Ferret**. It's also part of the community list at
[Lissy93/portainer-templates](https://github.com/Lissy93/portainer-templates), which reads this file every night.

For more control (backups, the Apprise sidecar), deploy `compose.yaml` from the repository root as a stack instead.
