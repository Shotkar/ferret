/**
 * The signed-out screens' frame (sign in, create an account, forgot / reset password, check your email, the two-step
 * code, an invitation, naming a household): the form on the left, and on a wide screen a panel on the right that says
 * what Ferret is — FlyonUI's "Login 2" layout. On a phone, just the form.
 */
import type { ReactNode } from "react";
import { isFerretDay, tapLogo } from "./lib/dook";
import { Trans } from "@lingui/react/macro";
import { t, msg } from "@lingui/core/macro";

export function Logo({ className = "" }: { className?: string }) {
  const party = isFerretDay();
  return (
    <span
      className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}
      onClick={tapLogo}
      // not translated
      title={party ? "Happy National Ferret Day!" : undefined}
    >
      <PawMark className="size-[1.4em] shrink-0" party={party} /> <Trans>Ferret</Trans>
    </span>
  );
}

/**
 * The paw from the app icon (public/favicon.svg), drawn in the text colour — the same on every platform, unlike 🐾.
 * On National Ferret Day (April 2, lib/dook.ts) it wears a party hat; `taps` counts taps towards the war dance where
 * it stands alone (the folded sidebar).
 */
export function PawMark({ className, party = isFerretDay(), taps }: { className?: string; party?: boolean; taps?: boolean }) {
  return (
    <svg viewBox="8 9 48 44" className={`overflow-visible ${className ?? ""}`} fill="currentColor" aria-hidden onClick={taps ? tapLogo : undefined}>
      <ellipse cx="32" cy="42.5" rx="12.5" ry="10" />
      <ellipse cx="16.5" cy="29.5" rx="4.6" ry="6.2" transform="rotate(-22 16.5 29.5)" />
      <ellipse cx="26" cy="19.5" rx="5" ry="6.6" transform="rotate(-8 26 19.5)" />
      <ellipse cx="38" cy="19.5" rx="5" ry="6.6" transform="rotate(8 38 19.5)" />
      <ellipse cx="47.5" cy="29.5" rx="4.6" ry="6.2" transform="rotate(22 47.5 29.5)" />
      {party && (
        <g transform="rotate(14 32 6)">
          <path d="M23 13 L41 13 L33 -9 Z" className="fill-warning" />
          <path d="M26.3 4 L37.7 4 L36.6 1 L27.4 1 Z" className="fill-error" />
          <path d="M23 13 L41 13 L40 10.3 L24 10.3 Z" className="fill-info" />
          <circle cx="33" cy="-9.5" r="3" className="fill-error" />
        </g>
      )}
    </svg>
  );
}

const POINTS = [
  { icon: "icon-[tabler--search]", text: msg`Find anything by what it is, what it's for, or a word on its receipt.` },
  { icon: "icon-[tabler--shield-check]", text: msg`Warranties, manuals and maintenance, with a reminder before they matter.` },
  { icon: "icon-[tabler--file-certificate]", text: msg`An insurance report ready the day you need one.` },
  { icon: "icon-[tabler--lock]", text: msg`Shared with your household, kept on your own server, files encrypted.` },
];

export function AuthLayout(props: {
  /** A Tabler icon class shown above the title (e.g. a mail for "check your email"). */
  icon?: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-base-100 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Logo className="text-2xl text-primary" />
          <div className="flex flex-col gap-2">
            {props.icon && (
              <span className="mb-2 flex size-12 items-center justify-center rounded-box bg-primary/10 text-primary">
                <span className={`${props.icon} size-7`} />
              </span>
            )}
            <h1 className="text-2xl font-semibold text-base-content">{props.title}</h1>
            {props.subtitle && <div className="text-base-content/70">{props.subtitle}</div>}
          </div>
          {props.children}
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-content lg:flex lg:flex-col lg:justify-center" aria-hidden>
        {/* A big, faint paw as the panel's picture. */}
        <PawMark className="pointer-events-none absolute -end-24 -bottom-24 size-[28rem] opacity-10" />
        <div className="relative flex max-w-md flex-col gap-8">
          <p className="text-4xl font-semibold leading-tight"><Trans>Find anything you own.</Trans></p>
          <ul className="flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.icon} className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-box bg-primary-content/15">
                  <span className={`${p.icon} size-5`} />
                </span>
                <span className="pt-2 text-primary-content/90">{t(p.text)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
