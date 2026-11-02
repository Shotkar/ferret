/** Lending: lent and borrowed things, reminder emails to borrowers, and the borrower's page (no account). */
import { today } from "@ferret/shared/utils";
import { describe, expect, it } from "vitest";
import { loan as loanTable } from "../src/db/schema";
import { sendLoanReminders } from "../src/lib/loans";
import { config, FakeNotifier, setup } from "./helpers";

type User = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["user"]>>;
const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const send = (u: User, method: string, url: string, data?: object) => u.as(url, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
const MAIL = "mailtos://ferret:pw@mail.example.com";
/** Loans written down on this day (reminders count from it). */
const recordedOn = (db: Awaited<ReturnType<typeof setup>>["db"], day: string) => db.update(loanTable).set({ createdAt: new Date(`${day}T12:00:00Z`) });

describe("lending", () => {
  it("lends, reminds the borrower by email, lets them say it's back, and ends", async () => {
    const notifier = new FakeNotifier();
    const { app, db, files, user } = await setup({ notifier, mailUrl: MAIL });
    const ann = await user("ann");
    const ladder = await ann.addItem({ name: "Ladder" });
    const lent = await send(ann, "POST", `/api/v1/items/${ladder.id}/loans`, {
      direction: "lent", person: "Sam", email: "sam@example.com", since: "2026-05-03", remindEvery: "week",
    });
    expect(lent.status).toBe(201);
    const loan = await json<{ id: string; person: string; remindEvery: string }>(lent);
    expect(loan).toMatchObject({ person: "Sam", remindEvery: "week" });
    expect((await send(ann, "POST", `/api/v1/items/${ladder.id}/loans`, { direction: "lent", person: "Pat" })).status).toBe(409);
    expect(await json(ann.as("/api/v1/items"))).toMatchObject({ data: [{ name: "Ladder", loan: { direction: "lent", person: "Sam", since: "2026-05-03" } }] });
    expect(await json(ann.as("/api/v1/loans"))).toMatchObject({ data: [{ id: loan.id, itemName: "Ladder" }], canEmail: true });

    // The first reminder a week after lending; then not again until the next week.
    await recordedOn(db, "2026-05-03");
    const remind = (on: string) => sendLoanReminders({ db, notifier, files, mailUrl: MAIL, appUrl: config.PUBLIC_URL, on });
    expect(await remind("2026-05-09")).toBe(0);
    expect(await remind("2026-05-10")).toBe(1);
    expect(await remind("2026-05-10")).toBe(0);
    expect(await remind("2026-05-16")).toBe(0);
    expect(await remind("2026-05-17")).toBe(1);
    const mail = notifier.sent[0]!;
    expect(mail.url).toBe(`${MAIL}?to=${encodeURIComponent("sam@example.com")}`);
    expect(mail.title).toBe("A reminder from ann: Ladder");
    expect(mail.body).toContain("Hi Sam,\n\nann lent you Ladder on May 3, 2026.");
    const token = /\/b\/([\w-]+)/.exec(mail.body)![1]!;

    // The borrower's page: no account.
    const anon = (url: string, method = "GET") => app.request(url, { method });
    expect(await json(anon(`/api/v1/borrowed/${token}`))).toEqual({
      person: "Sam", owner: "ann", itemName: "Ladder", since: "2026-05-03", dueOn: null, returned: false, reportedBack: false, stopped: false,
    });
    expect((await app.request(`/b/${token}`)).headers.get("location")).toBe(`/#/b/${token}`);
    expect(await json(anon(`/api/v1/borrowed/${token}/returned`, "POST"))).toMatchObject({ reportedBack: true });
    expect(await remind("2026-05-24")).toBe(0); // they said it's back: no more reminders
    const bell = await json<{ data: { kind: string; title: string }[] }>(ann.as("/api/v1/attention"));
    expect(bell.data).toContainEqual(expect.objectContaining({ kind: "loan", title: "Sam says Ladder is back" }));

    // Agreed: the loan ends, the link stops working, and the history has it all.
    expect(await json(send(ann, "POST", `/api/v1/loans/${loan.id}/returned`, { on: "2026-05-20" }))).toMatchObject({ returnedOn: "2026-05-20" });
    expect((await anon(`/api/v1/borrowed/${token}`)).status).toBe(404);
    expect((await json<{ data: { loan: unknown }[] }>(ann.as("/api/v1/items"))).data[0]!.loan).toBeNull();
    const history = await json<{ data: { summary: string }[] }>(ann.as(`/api/v1/items/${ladder.id}/history`));
    expect(history.data.map((h) => h.summary).slice(0, 3)).toEqual(["Ladder is back from Sam", "Sam says Ladder is back", "Lent Ladder to Sam"]);
  });

  it("reminds on the due date first, and stops when asked", async () => {
    const notifier = new FakeNotifier();
    const { app, db, files, user } = await setup({ notifier, mailUrl: MAIL });
    const ann = await user("ann");
    const drill = await ann.addItem({ name: "Drill" });
    await send(ann, "POST", `/api/v1/items/${drill.id}/loans`, { direction: "lent", person: "Pat", email: "pat@example.com", since: "2026-06-01", dueOn: "2026-06-20", remindEvery: "month" });
    await recordedOn(db, "2026-06-01");
    const remind = (on: string) => sendLoanReminders({ db, notifier, files, mailUrl: MAIL, appUrl: config.PUBLIC_URL, on });
    expect(await remind("2026-06-19")).toBe(0);
    expect(await remind("2026-06-20")).toBe(1);
    expect(notifier.sent[0]!.body).toContain("to bring back by June 20, 2026");
    const token = /\/b\/([\w-]+)/.exec(notifier.sent[0]!.body)![1]!;
    expect(await json(app.request(`/api/v1/borrowed/${token}/stop`, { method: "POST" }))).toMatchObject({ stopped: true });
    expect(await remind("2026-07-20")).toBe(0);

    // "Stop" is for the address: lending them something else (or the same again) doesn't start the emails again.
    const loans = await json<{ data: { id: string }[] }>(ann.as("/api/v1/loans"));
    expect((await send(ann, "DELETE", `/api/v1/loans/${loans.data[0]!.id}`)).status).toBeLessThan(300);
    await send(ann, "POST", `/api/v1/items/${drill.id}/loans`, { direction: "lent", person: "Pat", email: "PAT@example.com", since: "2026-08-01", remindEvery: "week" });
    await recordedOn(db, "2026-08-01");
    expect(await remind("2026-08-08")).toBe(0);
    expect(notifier.sent).toHaveLength(1);
  });

  it("counts reminders from when a loan is written down, not the day it went", async () => {
    const notifier = new FakeNotifier();
    const { db, files, user } = await setup({ notifier, mailUrl: MAIL });
    const ann = await user("ann");
    const tent = await ann.addItem({ name: "Tent" });
    await send(ann, "POST", `/api/v1/items/${tent.id}/loans`, { direction: "lent", person: "Lee", email: "lee@example.com", since: "2020-01-01", remindEvery: "week" });
    await recordedOn(db, "2026-09-01");
    const remind = (on: string) => sendLoanReminders({ db, notifier, files, mailUrl: MAIL, appUrl: config.PUBLIC_URL, on });
    expect(await remind("2026-09-01")).toBe(0);
    expect(await remind("2026-09-07")).toBe(0);
    expect(await remind("2026-09-08")).toBe(1);
  });

  it("reminds you to give back what you borrowed, and keeps borrowers' emails out of it", async () => {
    const { user } = await setup();
    const ann = await user("ann");
    const saw = await ann.addItem({ name: "Tile saw" });
    // Local, as the server counts days (a UTC date is already tomorrow on a Denver evening).
    const yesterday = today(new Date(Date.now() - 86_400_000));
    const loan = await json<{ email: string | null; remindEvery: string | null; overdue: boolean }>(
      send(ann, "POST", `/api/v1/items/${saw.id}/loans`, { direction: "borrowed", person: "Lee", email: "lee@example.com", remindEvery: "week", since: "2026-01-01", dueOn: yesterday }),
    );
    expect(loan).toMatchObject({ email: null, remindEvery: null, overdue: true });
    const bell = await json<{ data: { kind: string; severity: string; title: string; detail: string }[] }>(ann.as("/api/v1/attention"));
    expect(bell.data).toContainEqual({ kind: "loan", severity: "urgent", title: "Give Tile saw back to Lee", detail: "1 day overdue", id: expect.any(String), itemId: saw.id, date: yesterday });
    const bob = await user("bob");
    expect(await json(bob.as("/api/v1/loans"))).toMatchObject({ data: [] });
  });
});
