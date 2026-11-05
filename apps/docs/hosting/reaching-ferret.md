# Choosing a way in

Ferret is meant to live on your home network. To use it when you're out — on the phone, at work, at the shop deciding
whether you already own one — you need a way in. There are two kinds:

- **Bring the device home**: a VPN (WireGuard, Tailscale, Cloudflare WARP) puts your phone on your home network, so
  Ferret works exactly as it does on the Wi-Fi and stays off the internet altogether. The simplest, and the safest.
- **Bring Ferret out**: a tunnel or reverse proxy gives Ferret a public name, with an **access proxy** in front
  (Cloudflare Access, Pangolin, Traefik with client certificates) so strangers are stopped before they reach it.
  Nothing to install on the phone, and links you send to other people can work.

Either way, Ferret's own sign-in still decides who someone is and what they can see.

## At a glance

| | VPN (WireGuard, Tailscale) | Cloudflare WARP | Tunnel + Cloudflare Access | Reverse proxy + client certificates |
| --- | --- | --- | --- | --- |
| On the internet | no | no (private network) | yes, behind Access | yes, behind the certificate |
| On each phone | the VPN app | the WARP app | nothing (a sign-in now and then) | a certificate |
| The installed app | works as at home | works as at home | works — [sign in inside it](./phone-app) | works — [check once](./client-certificates#iphone-and-ipad) |
| Scripts and Claude | from a device on the VPN | from a device with WARP | a [service token](./tunnels#scripts-and-claude-service-tokens) + an API key | a certificate, or a separate rule for `/mcp` |
| Share and borrower links | only for people on your network | the same | [partly](./tunnels#let-through-what-can-t-sign-in-to-the-proxy) | no |
| Calendar feed away from home | catches up at home | catches up at home | yes, with a bypass | no |
| Cost | free | free up to 50 people | free up to 50 people | free (your own proxy) |

**Our suggestion:** if you already run WireGuard or Tailscale, use it — see [VPN](./away-from-home). If you'd rather
not run a VPN, Cloudflare Tunnel with Access works well; read [The phone app behind a proxy](./phone-app) first.

## The pages in this section

- [VPN: WireGuard, Tailscale or WARP](./away-from-home) — the phone joins your home network.
- [Tunnels and access proxies](./tunnels) — a public name with a proxy in front: which proxies Ferret should believe,
  what to let through, service tokens for scripts and Claude, one sign-in instead of two.
- [The phone app behind a proxy](./phone-app) — what works for the installed app, and what can't.
- [Client certificates (mutual TLS)](./client-certificates) — only devices you've given a certificate get in.
- [Single sign-on](./single-sign-on) — sign in to Ferret with your own identity provider.

## Whichever you choose

- **Push notifications and Apprise messages still arrive** — they go out through Apple's (or Google's) push service and
  from your server. Opening Ferret from one needs the way in.
- **HTTPS everywhere.** Installing the app on an iPhone, the camera and push all need it. If Ferret's certificate comes
  from your own certificate authority, each device needs that authority trusted — iPhone: install it, then turn it on
  in Settings → General → About → *Certificate Trust Settings*.
- **Never put Ferret on the internet with nothing in front.** Its sign-in is careful (slowed-down wrong passwords,
  two-step sign-in, passkeys, alerts about new places), but an access proxy or VPN means strangers never reach it.
