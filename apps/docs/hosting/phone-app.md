# The phone app behind a proxy

Ferret installed on your phone's Home Screen is a web app: every page, photo and document it shows is an ordinary
request from the phone's browser engine. Behind an [access proxy](./tunnels), **every one of those requests** has to
get past the proxy — the app opening, its pictures (`<img>` tags), downloads, and the app updating itself — not just the
ones Ferret's code makes. That decides what works.

## What works

**The proxy's own sign-in** (Cloudflare Access with your identity provider or a one-time PIN by email, Pangolin,
Authelia…). Once you've signed in, the proxy sets a cookie and the browser sends it with everything, pictures included.

- **Sign in inside the installed app.** On an iPhone the Home Screen app keeps its own cookies, apart from Safari's:
  signing in to the proxy in Safari doesn't sign the app in. Open the app, sign in to the proxy there, then to Ferret.
- **Give it a long session.** The app meets the proxy's sign-in page again whenever the proxy's session runs out. In
  Cloudflare Access, set Ferret's application's *Session duration* to a month or more.
- **If your proxy's sign-in hands you to another site** (Google, GitHub…), check once on the iPhone that the Home
  Screen app comes back signed in afterwards. A one-time PIN by email stays inside the app.
- **When the session runs out**, the app may say it's offline even though you have signal: its requests now get the
  proxy's sign-in page instead of Ferret. Close the app and open it again — the proxy's sign-in appears.

**Client certificates** ([mutual TLS](./client-certificates)): the phone presents a certificate with every connection,
so there's no sign-in page at all and nothing runs out until the certificate does. Cloudflare Access offers it only on
its paid Zero Trust plans; your own Traefik or Caddy does it for free.

**Cloudflare WARP** (or any VPN): the device is checked, not the app, so the app needs nothing special — see
[VPN: WireGuard, Tailscale or WARP](./away-from-home#cloudflare-warp).

## What can't work: service tokens

Cloudflare Access's **service tokens** (two headers, `CF-Access-Client-Id` and `CF-Access-Client-Secret`) are for
[scripts and Claude](./tunnels#scripts-and-claude-service-tokens), not for the app. It isn't a setting Ferret is
missing:

1. **The app couldn't open.** Opening the app, and the files it's made of, are requests the browser makes by itself — a
   web page can't add headers to them. With a service token required, the app never loads, so nothing could send one.
2. **Pictures and downloads would break.** Only requests made from Ferret's code can carry extra headers; `<img>` tags,
   downloads and links can't. With *strict* service-token checking — Cloudflare's default for organisations made since
   October 2026 — Access doesn't hand back a cookie either, so every single request would need the headers.
3. **It wouldn't keep anyone out.** To send the token, the app would have to carry the secret, so anyone who could open
   the app would have it. A service token stands for one machine you control.

## Good to know

- **Ferret's sign-in comes after the proxy's.** To sign in once instead of twice, let the proxy's sign-in be Ferret's
  too: [one sign-in instead of two](./tunnels#one-sign-in-instead-of-two).
- **Offline capture still works** behind a proxy: things you add with no signal wait on the phone and are sent once the
  app can reach Ferret again — after you've signed in to the proxy if its session ran out meanwhile.
- **Push notifications** come from Apple's or Google's push service, so they arrive whatever the proxy's session says.
