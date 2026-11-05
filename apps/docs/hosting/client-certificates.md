# Client certificates (mutual TLS)

Instead of a sign-in page, a proxy in front of Ferret can ask every device for a **client certificate**. Only devices
you've given one get in at all: no sign-in to run out, nothing for a stranger to try passwords on. Ferret's own sign-in
still comes after.

This page is about **your devices showing a certificate to reach Ferret**. For Ferret's own connections to your other
services, see [Certificates](./certificates).

## Where to ask for one

| Proxy | How | Paths that can't show one |
| --- | --- | --- |
| **Cloudflare Access** | Zero Trust → Access controls → Service credentials → *Mutual TLS*: upload your authority, list Ferret's hostname; then a policy on Ferret's application that requires a valid certificate | [bypass them](./tunnels#let-through-what-can-t-sign-in-to-the-proxy) as usual |
| **Traefik** | a TLS option with `clientAuth` (`RequireAndVerifyClientCert`) on Ferret's router | none — see below |
| **Caddy** | `tls` → `client_auth` with `mode require_and_verify` and `trust_pool file` your authority's `ca.pem` | none — see below |

- **Cloudflare Access's mutual TLS needs a paid Zero Trust plan** (pay-as-you-go or Enterprise); it isn't on the free
  one. On the free plan, use the proxy's sign-in instead — [the phone app](./phone-app) works fine with it.
- **Your own proxy asks for the certificate when the connection starts**, before it knows which page is wanted, so it's
  all or nothing for Ferret's hostname. The calendar feed, share links and borrowers' links (opened by apps and people
  without a certificate) then don't work from outside — keep them for your network or VPN. Cloudflare Access checks the
  certificate per application, so bypassed paths still work there.

## Making the certificates

You need a small **certificate authority** of your own (it signs the devices' certificates; the proxy trusts it) and one
certificate per device. If you already run one — `step-ca`, your router's — use it. Otherwise OpenSSL 3 or newer:

```sh
# Once: the authority. Keep ca.key somewhere safe and offline; anyone with it can make certificates.
openssl req -x509 -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -days 3650 \
  -keyout ca.key -out ca.pem -subj "/CN=Home devices" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

# Each device: a key, a certificate signed by the authority, then both in one .p12 with a password.
printf "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n" > client.ext
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
  -keyout phone.key -out phone.csr -subj "/CN=Sam's iPhone"
openssl x509 -req -in phone.csr -CA ca.pem -CAkey ca.key -days 825 -extfile client.ext -out phone.pem
openssl pkcs12 -export -inkey phone.key -in phone.pem -certfile ca.pem -name "Sam's iPhone" -out phone.p12
```

Give the proxy `ca.pem` (never `ca.key`), and each device its own `.p12`. One certificate per device means a lost phone
is one certificate to stop trusting — not everyone's.

## Putting them on devices

### iPhone and iPad

AirDrop or email the `.p12` to the phone (or put it in a configuration profile), then Settings → *Profile Downloaded* →
Install, and type its password. Safari offers the certificate when Ferret's proxy asks. **Check once that the installed
Home Screen app does too** — open it after installing the certificate; if it can't get in while Safari can, use the
proxy's sign-in for the phone instead.

If the iPhone says the password is wrong when it isn't, make the `.p12` again with `-legacy` added to the last command
(an older way of locking it that every iPhone reads).

### Mac

Open the `.p12` to add it to the login keychain. Safari and Chrome ask which certificate to use the first time.

### Android

Settings → Security → *Encryption & credentials* → Install a certificate → *VPN & app user certificate* (the wording
varies). Chrome asks which certificate to use the first time.

### Scripts and Claude

- **Scripts**: `curl --cert-type P12 --cert device.p12:password …`, with an API key as usual.
- **Claude Code** can't present a client certificate. With Cloudflare Access, give `/mcp` its own application that
  takes a [service token](./tunnels#scripts-and-claude-service-tokens) instead (an API key is still needed); with your
  own proxy, connect from your network or VPN.

## When a device is lost, or a certificate runs out

- **Lost**: Cloudflare Access and most proxies don't check revocation lists for you. The simplest is to make a new
  authority, give every remaining device a new certificate from it, and swap the authority in the proxy.
- **Running out**: the commands above make certificates for 825 days. Note the date; make the new one before then.
