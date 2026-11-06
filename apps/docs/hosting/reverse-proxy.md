# Reverse proxy examples

A reverse proxy gives Ferret an `https://` address — which installing it on an iPhone, the camera and push all need —
and lets it share a machine with other apps. Ferret listens on port **8787** and needs nothing unusual from the proxy.
Three things matter whichever one you use:

- **`PUBLIC_URL`** in Ferret's `.env` is the proxy's address, e.g. `https://ferret.example.lan`
  ([Settings](./configuration#the-address-public-url)).
- **`TRUSTED_PROXIES`** is the proxy's address as Ferret sees it — on the same Docker network, that network's range
  (e.g. `172.18.0.0/16`; `docker network inspect <network>` shows it). Then Ferret believes the visitor's address the
  proxy passes on, and nobody else's. Behind more than one proxy, list them all ([Tunnels](./tunnels)).
- **Uploads up to `MAX_UPLOAD_MB`** (25 MB unless you change it) must get through the proxy. Caddy and Traefik don't
  limit them; nginx stops at 1 MB unless told otherwise.

**Download everything** sends a large ZIP as it's made, so don't cut long responses short (nginx's examples below
allow 10 minutes).

## Caddy

Caddy gets a certificate by itself and passes on the visitor's address. With Ferret on the same Docker network as Caddy:

```
ferret.example.com {
	reverse_proxy ferret:8787
}
```

On a LAN-only name Let's Encrypt can't reach, use Caddy's own certificates (`tls internal`) or your own
(`tls cert.pem key.pem`) — then add your authority's certificate to your devices.

## nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name ferret.example.com;

    ssl_certificate     /etc/nginx/certs/ferret.example.com.crt;
    ssl_certificate_key /etc/nginx/certs/ferret.example.com.key;

    client_max_body_size 30m;     # a little over MAX_UPLOAD_MB
    proxy_read_timeout 600s;      # Download everything
    proxy_send_timeout 600s;

    location / {
        proxy_pass http://ferret:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx Proxy Manager: add a proxy host for `ferret`, port `8787`, and under **Advanced** put
`client_max_body_size 30m;`.

## Traefik

Labels on Ferret's service in `compose.yaml`, with Traefik on the same Docker network (`proxy` here) and a certificate
resolver called `letsencrypt`:

```yaml
services:
  ferret:
    # … as in Ferret's compose.yaml; the ports: line can go
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.ferret.rule=Host(`ferret.example.com`)
      - traefik.http.routers.ferret.entrypoints=websecure
      - traefik.http.routers.ferret.tls.certresolver=letsencrypt
      - traefik.http.services.ferret.loadbalancer.server.port=8787

networks:
  proxy:
    external: true
```

Traefik has no upload limit unless you add a `buffering` middleware. With Traefik on another machine, use its file
provider and point the service at `http://<ferret's machine>:8787`; `TRUSTED_PROXIES` is then that machine's address.

## Checking it

- Open `PUBLIC_URL`: the sign-in page loads, and the browser shows a padlock.
- Sign in, then **Settings → Security → Recent sign-ins** — it should show your device's address, not the proxy's.
  If it shows the proxy's, `TRUSTED_PROXIES` is missing it.
- Add a photo bigger than 1 MB to an item; if it fails, the proxy's upload limit is too low.
