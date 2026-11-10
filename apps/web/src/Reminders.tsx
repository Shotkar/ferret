/**
 * Settings → Notifications → Reminders: a private calendar link for maintenance
 * (Apple/Google Calendar, with an alert on the day) and a daily push
 * notification to this device (on iPhone, only from the Home Screen app) of
 * what's urgent. Each is per person. Other apps (Apprise) are in Notifications.tsx.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyField } from "./CopyField";
import { api } from "./lib/api";
import { HelpLink } from "./HelpLink";
import { NotInPlan, usePlanFeature } from "./PlanUsage";
import { isIOS } from "./lib/install";
import { t, ph, plural } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/**
 * How this device adds a calendar link: an iPhone or iPad (and Safari on a Mac) hands `webcal://` to the Calendar app,
 * which asks to subscribe; Chrome and the rest on a Mac don't (or pass it to Chrome, which can't subscribe) — there it's
 * Calendar → File → New Calendar Subscription by hand; elsewhere, the link into whichever calendar they use.
 */
function calendarWay(): "apple" | "mac-safari" | "mac-other" | "other" {
  const ua = navigator.userAgent;
  if (isIOS()) return "apple";
  if (/Macintosh/.test(ua)) return /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|Firefox|OPR\//.test(ua) ? "mac-safari" : "mac-other";
  return "other";
}

/** A Ferret only the home network reaches (a .lan name, a 192.168… address): Google Calendar's servers can't fetch it. */
const atHome = (host = window.location.hostname) =>
  /(^localhost$|\.(lan|local|home|home\.arpa|internal|localdomain)$)/i.test(host) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host) ||
  (!host.includes(".") && !host.includes(":"));

export function Reminders({ householdId }: { householdId: string }) {
  return (
    <section className="card" aria-labelledby="reminders-title">
      <div className="card-body gap-5">
        <div className="space-y-1">
          <h2 id="reminders-title" className="card-title flex items-center gap-2">
            <span className="icon-[tabler--bell] size-5 text-primary" />
            <Trans>Reminders</Trans>
            <HelpLink page="guide/reminders.html" label={t`Reminders`} />
          </h2>
          <p className="text-sm text-base-content/70">
            <Trans>Hear about filters, servicing and warranties about to end, when it matters. Just for you.</Trans>
          </p>
        </div>
        <CalendarFeed householdId={householdId} />
        <hr className="border-base-content/10" />
        <PushReminders householdId={householdId} />
      </div>
    </section>
  );
}

function CalendarFeed({ householdId }: { householdId: string }) {
  const qc = useQueryClient();
  const key = ["calendar", householdId];
  const status = useQuery({ queryKey: key, queryFn: api.calendarStatus });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: api.createCalendar, onSuccess: refresh });
  const remove = useMutation({ mutationFn: api.deleteCalendar, onSuccess: refresh });
  const feed = status.data;
  const busy = create.isPending || remove.isPending;
  const feature = usePlanFeature(householdId, "calendarFeeds");

  function reset() {
    if (window.confirm(t`Make a new link? Calendars subscribed to the current one stop updating until you subscribe again.`)) create.mutate();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="avatar avatar-placeholder">
          <div className="size-10 rounded-full bg-primary/10 text-primary">
            <span className="icon-[tabler--calendar-event] size-5" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-base-content"><Trans>Calendar (maintenance)</Trans></h3>
          <p className="text-sm text-base-content/70">
            {feed?.active && !feature.on
              ? t`Paused: nothing new comes through to your calendar until your plan has calendar feeds again.`
              : feed?.active
              ? t`On: due maintenance shows up in your calendar, with an alert at 9:00 on the day. Add it on each device you want it on.`
              : t`Due maintenance in your calendar app, kept up to date, with an alert at 9:00 on the day.`}
          </p>
        </div>
        {!feed?.active && feature.on && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || status.isPending} onClick={() => create.mutate()}>
            {create.isPending && <span className="loading loading-spinner loading-xs" />}
            <Trans>Turn on</Trans>
          </button>
        )}
      </div>

      {!feature.on && <NotInPlan feature="calendarFeeds" planName={feature.planName} />}

      {feature.on && feed?.active && feed.url && feed.webcal && <AddToCalendar url={feed.url} webcal={feed.webcal} />}
      {feature.on && feed?.active && !feed.url && (
        <p className="ps-13 text-sm text-base-content/70 max-sm:ps-0">
          <Trans>This link was made before Ferret kept links, so it can't be shown. Reset it to get one you can see here (subscribe again with it).</Trans>
        </p>
      )}

      {feed?.active && (
        <div className="flex flex-wrap gap-2 ps-13 max-sm:ps-0">
          {feature.on && (
            <button type="button" className="btn btn-text btn-sm" disabled={busy} onClick={reset}>
              {create.isPending ? <span className="loading loading-spinner loading-xs" /> : <span className="icon-[tabler--refresh] size-4" />}
              <Trans>Reset link</Trans>
            </button>
          )}
          <button type="button" className="btn btn-text btn-sm" disabled={busy} onClick={() => remove.mutate()}>
            <span className="icon-[tabler--calendar-off] size-4" />
            <Trans>Turn off</Trans>
          </button>
        </div>
      )}
      {(create.isError || remove.isError) && <p className="text-sm text-error">{create.error?.message ?? remove.error?.message}</p>}
    </div>
  );
}

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** The VAPID public key as the bytes pushManager.subscribe wants. */
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function PushReminders({ householdId }: { householdId: string }) {
  const qc = useQueryClient();
  const key = ["push", householdId];
  const supported = pushSupported();
  const status = useQuery({
    queryKey: key,
    queryFn: async () => api.pushStatus((await currentSubscription())?.endpoint),
    enabled: supported,
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      const existing = await currentSubscription();
      if (!on) {
        if (existing) {
          await api.pushUnsubscribe(existing.endpoint);
          await existing.unsubscribe();
        }
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        throw new Error(t`Notifications are blocked for Ferret — allow them in your browser or iPhone Settings`);
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.data!.publicKey!) }));
      await api.pushSubscribe(subscription.toJSON());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const test = useMutation({ mutationFn: api.pushTest });

  let note: string;
  if (!supported) {
    note = isIos()
      ? t`On iPhone: tap Share → Add to Home Screen, open Ferret from your Home Screen, then turn this on there.`
      : t`This browser can't receive push notifications.`;
  } else if (status.data && !status.data.enabled) {
    note = t`Not set up on this server yet (it needs VAPID keys).`;
  } else if (status.data?.subscribed) {
    note = t`On for this device: one notification a day when maintenance is due or a warranty ends within a week.`;
  } else {
    note = t`A notification on this device on days maintenance is due or a warranty is about to end.`;
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="avatar avatar-placeholder">
        <div className="size-10 rounded-full bg-primary/10 text-primary">
          <span className="icon-[tabler--device-mobile-message] size-5" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-base-content"><Trans>Push on this device</Trans></h3>
        <p className="text-sm text-base-content/70">{note}</p>
        {(toggle.isError || test.isError) && <p className="mt-1 text-sm text-error">{toggle.error?.message ?? test.error?.message}</p>}
        {test.data && <p className="mt-1 text-sm text-success">{plural(test.data.sent, { one: "Sent to # device.", other: "Sent to # devices." })}</p>}
      </div>
      {supported && status.data?.enabled && (
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          {status.data.subscribed && (
            <button type="button" className="btn btn-text btn-sm" disabled={test.isPending} onClick={() => test.mutate()}>
              <Trans>Send a test</Trans>
            </button>
          )}
          <input
            type="checkbox"
            className="switch switch-primary"
            aria-label={t`Push notifications on this device`}
            checked={status.data.subscribed}
            disabled={toggle.isPending}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
        </div>
      )}
    </div>
  );
}

/** The calendar link into this device's calendar: one button where Calendar takes it, the steps where it doesn't. */
function AddToCalendar({ url, webcal }: { url: string; webcal: string }) {
  const way = calendarWay();
  const byHand = (
    <ol className="list-decimal space-y-0.5 ps-5 text-sm text-base-content/80">
      <li><Trans>Copy the calendar link below.</Trans></li>
      <li>
        <Trans>In the <strong>Calendar</strong> app, choose <strong>File → New Calendar Subscription…</strong> (⌥⌘S).</Trans>
      </li>
      <li>
        <Trans>Paste it, then <strong>Subscribe</strong> and <strong>OK</strong></Trans>.
      </li>
    </ol>
  );
  return (
    <div className="flex flex-col gap-3 ps-13 max-sm:ps-0">
      {way === "mac-other" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-base-content"><Trans>Add it to Apple Calendar on this Mac:</Trans></p>
          {byHand}
        </div>
      ) : (
        way !== "other" && (
          <div className="flex flex-col gap-1.5">
            <a href={webcal} className="btn btn-primary btn-sm self-start">
              <span className="icon-[tabler--calendar-plus] size-4" />
              <Trans>Add to Calendar</Trans>
            </a>
            <p className="text-xs text-base-content/70"><Trans>Opens your Calendar app, which asks to subscribe — say yes.</Trans></p>
            {way === "mac-safari" && (
              <details className="text-sm">
                <summary className="tap cursor-pointer text-base-content/80"><Trans>It opened another app, or asked to open Chrome?</Trans></summary>
                <div className="mt-1.5">{byHand}</div>
              </details>
            )}
          </div>
        )
      )}
      <CopyField label={t`Calendar link`} value={url} icon="icon-[tabler--link]" />
      <details className="text-sm" open={way === "other"}>
        <summary className="tap cursor-pointer text-base-content/80"><Trans>Google Calendar, Outlook or another calendar</Trans></summary>
        <ul className="mt-1.5 list-disc space-y-1 ps-5 text-base-content/80">
          {atHome() ? (
            <li>
              <Trans><strong>Google Calendar</strong> can't use it: Google fetches calendars from its own servers, and they can't reach a Ferret at home
              ({ph({ hostname: window.location.hostname })}). Use Apple Calendar or Outlook on your own devices instead.</Trans>
            </li>
          ) : (
            <li>
              <Trans><strong>Google Calendar</strong> (on a computer): <strong>Other calendars → + → From URL</strong>, paste the link, <strong>Add calendar</strong></Trans>.
            </li>
          )}
          <li>
            <Trans><strong>Outlook</strong>: <strong>Add calendar → Subscribe from web</strong>, and paste the link.</Trans>
          </li>
          <li>
            <Trans><strong>An iPhone or iPad</strong>: open these settings there and press <strong>Add to Calendar</strong></Trans>.
          </li>
        </ul>
      </details>
      <p className="text-xs text-base-content/70">
        <Trans>Keep it private: anyone with the link can see your maintenance tasks.{" "}
        <a href="/docs/guide/reminders.html#if-add-to-calendar-doesn-t-work" className="link tap">
          Trouble adding it?
        </a></Trans>
      </p>
    </div>
  );
}
