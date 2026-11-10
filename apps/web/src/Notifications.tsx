/**
 * Settings → Notifications → Other apps: reminders in ntfy, Pushover,
 * Telegram, email… Each is an Apprise URL the server sends through its
 * apprise-api sidecar. Per person; Ferret never shows a URL again (they hold
 * tokens), only which service it goes to.
 */
import type { NotificationChannel } from "@ferret/shared";
import { NOTIFICATION_SERVICES } from "@ferret/shared/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "./lib/api";
import { Modal } from "./Modal";
import { HelpLink } from "./HelpLink";
import { t, ph } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

/** Common services and how their Apprise URLs look (tap one to start from it). */
const EXAMPLES = [
  { service: "ntfy", url: "ntfys://ntfy.sh/your-topic" },
  { service: "Pushover", url: "pover://user_key@app_token" },
  { service: "Prowl", url: "prowl://api_key" },
  { service: "Telegram", url: "tgram://bot_token/chat_id" },
  { service: "Home Assistant", url: "hassios://homeassistant.local/long_lived_token" },
  { service: "Email", url: "mailtos://user:app_password@gmail.com" },
  { service: "Discord", url: "discord://webhook_id/webhook_token" },
] as const;

const SERVICES_URL = "https://appriseit.com/services/";

/** Friendly names for the schemes people are most likely to use. */
const SERVICE_NAMES = NOTIFICATION_SERVICES;

export function Notifications({ householdId }: { householdId: string }) {
  const qc = useQueryClient();
  const key = ["notifications", householdId];
  const channels = useQuery({ queryKey: key, queryFn: api.listNotifications });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [adding, setAdding] = useState(false);
  const enabled = channels.data?.enabled;

  return (
    <section className="card" aria-labelledby="other-apps-title">
      <div className="card-body gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* At least 16rem for the words, so on a phone the button goes under them rather than squeezing them. */}
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            <h2 id="other-apps-title" className="card-title flex items-center gap-2">
              <span className="icon-[tabler--send] size-5 text-primary" />
              <Trans>Other apps</Trans>
              <HelpLink page="guide/reminders.html#other-apps" label={t`Other apps`} />
            </h2>
            <p className="text-sm text-base-content/70">
              <Trans>Get the same daily reminder in ntfy, Pushover, Telegram, email and{" "}
              <a href={SERVICES_URL} target="_blank" rel="noreferrer" className="link link-primary">
                100+ other apps
              </a>
              . Just for you.</Trans>
            </p>
          </div>
          {enabled && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <span className="icon-[tabler--plus] size-4" />
              <Trans>Add</Trans>
            </button>
          )}
        </div>

        {channels.isPending && <span className="loading loading-spinner text-primary" />}
        {channels.isError && <div className="alert alert-soft alert-error">{channels.error.message}</div>}
        {channels.data && !enabled && (
          <p className="text-sm text-base-content/70"><Trans>Not set up on this server yet (it needs the Apprise container and APPRISE_URL).</Trans></p>
        )}
        {channels.data && enabled && channels.data.data.length === 0 && (
          <div className="rounded-box border border-dashed border-base-content/20 p-6 text-center text-sm text-base-content/70">
            <Trans>Nothing yet. Add your ntfy topic, Pushover or anything else Apprise can send to.</Trans>
          </div>
        )}
        {channels.data && channels.data.data.length > 0 && (
          <ul className="space-y-2">
            {channels.data.data.map((c) => (
              <ChannelRow key={c.id} channel={c} enabled={Boolean(enabled)} onChanged={refresh} />
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <AddChannelModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

function ChannelRow({ channel, enabled, onChanged }: { channel: NotificationChannel; enabled: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const test = useMutation({ mutationFn: () => api.testNotification(channel.id), onSettled: onChanged });
  const remove = useMutation({ mutationFn: () => api.deleteNotification(channel.id), onSuccess: onChanged });
  const error = test.isError ? test.error.message : channel.lastError;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-box p-2 hover:bg-neutral/10">
      <div className="avatar avatar-placeholder">
        <div className={`size-10 rounded-full ${error ? "bg-error/10 text-error" : "bg-primary/10 text-primary"}`}>
          <span className={`${error ? "icon-[tabler--alert-triangle]" : "icon-[tabler--send]"} size-5`} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 font-medium text-base-content">
          <span className="truncate">{channel.name}</span>
          <span className="badge badge-soft badge-secondary badge-sm">{SERVICE_NAMES[channel.service] ?? channel.service}</span>
        </h3>
        {error ? (
          <p className="text-sm text-error">{error}</p>
        ) : test.isSuccess ? (
          <p className="text-sm text-success"><Trans>Sent — check that it arrived.</Trans></p>
        ) : (
          <p className="text-sm text-base-content/70">
            {channel.lastNotifiedOn ? t`Last reminder ${ph({ formatDay: formatDay(channel.lastNotifiedOn) })}` : t`No reminders sent yet`}
          </p>
        )}
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-1 max-sm:w-full max-sm:justify-end">
          <button type="button" className="btn btn-error btn-sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trans>Remove</Trans>
          </button>
          <button type="button" className="btn btn-text btn-sm" onClick={() => setConfirming(false)}>
            <Trans>Keep</Trans>
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-end">
          {enabled && (
            <button type="button" className="btn btn-text btn-sm" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending && <span className="loading loading-spinner loading-xs" />}
              <Trans>Send a test</Trans>
            </button>
          )}
          <button
            type="button"
            className="btn btn-text btn-sm btn-square btn-error"
            aria-label={t`Remove ${ph({ name: channel.name })}`}
            onClick={() => setConfirming(true)}
          >
            <span className="icon-[tabler--trash] size-5" />
          </button>
        </div>
      )}
    </li>
  );
}

function AddChannelModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const channel = await api.addNotification({ name: name.trim(), url: url.trim() });
      // Try it straight away, so a typo shows up now rather than on the first reminder.
      await api.testNotification(channel.id).catch(() => undefined);
    },
    onSuccess: onAdded,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    add.mutate();
  }

  return (
    <Modal id="new-notification" onClose={onClose}>
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <div className="space-y-1 text-center">
          <h3 id="new-notification-title" className="text-2xl font-semibold text-base-content">
            <Trans>Add an app</Trans>
          </h3>
          <p className="text-base-content/80"><Trans>Where should Ferret send your reminders?</Trans></p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label-text" htmlFor="notification-name">
              <Trans>Name</Trans>
            </label>
            <div className="input">
              <span className="icon-[tabler--tag] my-auto me-3 size-5 shrink-0 text-base-content/80" />
              <input
                id="notification-name"
                className="grow"
                placeholder={t`e.g. My phone (ntfy)`}
                maxLength={60}
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label-text" htmlFor="notification-url">
              <Trans>Apprise URL</Trans>
            </label>
            <div className="input">
              <span className="icon-[tabler--link] my-auto me-3 size-5 shrink-0 text-base-content/80" />
              <input
                id="notification-url"
                className="grow font-mono text-sm"
                placeholder="ntfys://ntfy.sh/your-topic"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                pattern="[a-zA-Z][a-zA-Z0-9+.\-]*://\S+"
                title={t`An Apprise URL, like ntfys://ntfy.sh/your-topic`}
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-base-content/70">
              <Trans>It holds your token, so Ferret keeps it encrypted and won't show it again.{" "}
              <a href={SERVICES_URL} target="_blank" rel="noreferrer" className="link link-primary">
                Every service's format
              </a></Trans>
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-base-content/70"><Trans>Start from one of these:</Trans></p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.service}
                  type="button"
                  className="btn btn-soft btn-secondary btn-xs"
                  onClick={() => {
                    setUrl(ex.url);
                    if (!name) setName(ex.service);
                  }}
                >
                  {ex.service}
                </button>
              ))}
            </div>
          </div>
        </div>

        {add.isError && <div className="alert alert-soft alert-error">{add.error.message}</div>}

        <div className="flex flex-wrap items-center justify-end gap-4">
          <button type="button" className="btn btn-secondary btn-soft" onClick={onClose}>
            <Trans>Cancel</Trans>
          </button>
          <button type="submit" className="btn btn-primary" disabled={add.isPending}>
            {add.isPending && <span className="loading loading-spinner loading-sm" />}
            <Trans>Add and send a test</Trans>
          </button>
        </div>
      </form>
    </Modal>
  );
}

const formatDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
