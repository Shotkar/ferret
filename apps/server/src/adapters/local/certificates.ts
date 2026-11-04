/**
 * Certificates for Ferret's own connections (the TlsSettings port, lib/certificates.ts). Extra certificate authorities
 * become Node's default ones, so every connection that doesn't say otherwise trusts them — fetch (the models, Apprise,
 * Qdrant, the sign-in provider), Home Assistant's WebSocket. Client certificates go through one undici dispatcher,
 * which Node's own fetch and WebSocket use: each is presented only to the hosts it names, never to anyone else.
 * Downloads from the internet (download.ts) pass PUBLIC_AUTHORITIES themselves, so none of this reaches them.
 */
import { X509Certificate } from "node:crypto";
import tls from "node:tls";
import { Agent, buildConnector, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import type { CertificateDetails, TlsSettings } from "../../ports";

/** The authorities Node trusted at start (its own list, plus NODE_EXTRA_CA_CERTS / --use-system-ca): for the internet. */
export const PUBLIC_AUTHORITIES = tls.getCACertificates("default");

const BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

const details = (c: { subject: string; issuer: string; validTo: string; fingerprint256: string }): CertificateDetails => ({
  subject: c.subject.replace(/\n/g, ", "),
  issuer: c.issuer.replace(/\n/g, ", "),
  notAfter: new Date(c.validTo),
  fingerprint: c.fingerprint256,
});

/** "CN=x\nO=y" from a TLS socket's certificate object, like X509Certificate's. */
const dn = (parts: Record<string, string | string[]> | undefined) =>
  Object.entries(parts ?? {})
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("+") : v}`)
    .join("\n");

/** Whether `host` is one of `hosts`: the same name or address, or under a `*.example.lan`. */
export function hostMatches(hosts: string[], host: string) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return hosts.some((h) => (h.startsWith("*.") ? name.endsWith(h.slice(1)) : name === h));
}

export class NodeTls implements TlsSettings {
  private applied = false;

  readPem(pem: string) {
    if (/PRIVATE KEY-----/.test(pem)) throw new Error("That holds a private key — add only the certificate (the part between BEGIN CERTIFICATE and END CERTIFICATE)");
    const blocks = pem.match(BLOCK) ?? [];
    if (!blocks.length) throw new Error("No certificate found — paste it in PEM form (-----BEGIN CERTIFICATE-----…)");
    return blocks.map((b) => {
      try {
        return details(new X509Certificate(b));
      } catch {
        throw new Error("One of those certificates couldn't be read");
      }
    });
  }

  readPkcs12(bytes: Uint8Array, password: string) {
    let context: tls.SecureContext;
    try {
      context = tls.createSecureContext({ pfx: Buffer.from(bytes), passphrase: password });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(/mac verify|bad decrypt|password/i.test(message) ? "Wrong password for that file" : "That isn't a PKCS#12 (.p12 / .pfx) file Ferret can read");
    }
    // The certificate the file presents, read without connecting anywhere.
    const cert = new tls.TLSSocket(null as never, { secureContext: context }).getCertificate();
    if (!cert || !("subject" in cert)) throw new Error("That file has no certificate in it");
    return details({ subject: dn(cert.subject as never), issuer: dn(cert.issuer as never), validTo: cert.valid_to, fingerprint256: cert.fingerprint256 });
  }

  apply(trusted: string[], clients: { hosts: string[]; pkcs12: Uint8Array; password: string }[]) {
    // Nothing set and nothing ever applied: leave Node exactly as it was.
    if (!this.applied && !trusted.length && !clients.length) return;
    this.applied = true;
    tls.setDefaultCACertificates([...PUBLIC_AUTHORITIES, ...trusted]);
    // A connector without a certificate of its own reads the default authorities when it connects, so it sees the above.
    const plain = buildConnector({});
    const own = clients.map((c) => ({ hosts: c.hosts, connect: buildConnector({ pfx: Buffer.from(c.pkcs12), passphrase: c.password }) }));
    const before = getGlobalDispatcher();
    setGlobalDispatcher(
      new Agent({
        connect: (options, callback) => (own.find((c) => hostMatches(c.hosts, options.hostname))?.connect ?? plain)(options, callback),
      }),
    );
    // Connections already open finish what they're doing first.
    void before.close().catch(() => {});
  }
}
