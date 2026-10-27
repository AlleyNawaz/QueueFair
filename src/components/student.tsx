"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LockKeyhole,
  Printer,
  Users,
  Volume2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PublicService, PrivateTicket } from "@/server/reads";
import {
  api,
  Badge,
  Empty,
  ErrorBox,
  EstimatePanel,
  Loading,
  Location,
  Policy,
  Sync,
  useLive,
} from "./shared";
import { useLocale } from "./providers";
export function ServiceView({ slug }: { slug: string }) {
  const q = useLive<PublicService[]>("services", 3000);
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [existing, setExisting] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const s = q.data?.find((s) => s.slug === slug);
  const { ur, t } = useLocale();
  const join = useMutation({
    mutationFn: async () => {
      key.current ??= crypto.randomUUID();
      const perform = async () => {
        await api("auth/anonymous", {});
        return api<{ publicId: string; existing: boolean }>(
          `services/${s!.id}/tickets`,
          { reason: reason || s!.visitReasonOptions[0], note },
          "POST",
          key.current!,
        );
      };
      // Serialize initial capability issuance across tabs in this browser.
      return navigator.locks
        ? navigator.locks.request("queuefair-owner", perform)
        : perform();
    },
    onSuccess: (r) => {
      if (r.existing) setExisting(r.publicId);
      else router.push(`/tickets/${r.publicId}`);
    },
  });
  if (!q.data)
    return (
      <>
        <ErrorBox error={q.error} />
        <Loading />
      </>
    );
  if (!s)
    return (
      <main className="page">
        <h1>Service not found</h1>
        <Link href="/">Return to services</Link>
      </main>
    );
  const queueFull = s.waitingCount >= s.maxWaitingTickets;
  const canJoin = s.joiningOpen && !queueFull;
  return (
    <main className="page" dir={ur ? "rtl" : "ltr"}>
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> All services
      </Link>
      <div className="page-heading">
        <div>
          <Badge
            state={
              s.joiningOpen ? "OPEN" : s.state === "OPEN" ? "CLOSED" : s.state
            }
          />
          <h1>{s.name}</h1>
          <p>{s.description}</p>
          <Location location={s.location} />
        </div>
        <Link className="button outline" href={`/display/${slug}`}>
          Open public display <ArrowRight size={16} />
        </Link>
      </div>
      <div className="two-column">
        <section className="stack">
          <div className="panel">
            <div className="section-heading">
              <h2>{t.queueNow}</h2>
              <span className="live-dot">Near-real-time polling</span>
            </div>
            <div className="large-metrics">
              <div>
                <Users size={20} />
                <strong>{s.waitingCount}</strong>
                <span>people waiting</span>
              </div>
              <div>
                <Clock3 size={20} />
                <strong>
                  {s.waitingCount === 0 ? "No one waiting" : s.estimate.label}
                </strong>
                <span>
                  {s.waitingCount === 0
                    ? s.joiningOpen
                      ? "Joining is open"
                      : s.state === "PAUSED"
                        ? "Joining is paused"
                        : "Joining is closed"
                    : s.estimate.source}
                </span>
              </div>
            </div>
            <p>
              {s.counters.filter((c) => c.state === "ACTIVE").length} of{" "}
              {s.counters.length} counters set active · Today,{" "}
              {s.weeklyHours.open}–{s.weeklyHours.close} PKT
            </p>
            <small className="counter-state-note">
              Counter state is configuration only; it does not confirm an
              operator is present.
            </small>
            {(s.pauseReason || s.notice) && (
              <div className="notice">
                {s.pauseReason} {s.notice}
              </div>
            )}
            <EstimatePanel estimate={s.estimate} />
            <Sync error={q.error} at={s.syncedAt} />
          </div>
          <div className="panel">
            <h2>
              <FileCheck2 size={21} /> Before you visit
            </h2>
            <ul className="document-list">
              {s.documentRequirements.map((d) => (
                <li key={d}>
                  <CheckCircle2 size={16} />
                  {d}
                </li>
              ))}
            </ul>
            <p className="muted">
              Example requests: {s.visitReasonOptions.join(", ")}.
            </p>
          </div>
          <Policy />
        </section>
        <aside>
          <form
            className="panel join-panel"
            onSubmit={(e) => {
              e.preventDefault();
              join.mutate();
            }}
          >
            <span className="eyebrow">SAVE YOUR PLACE</span>
            <h2>{t.joinQueue}</h2>
            <p>{t.noAccount}</p>
            {s.serviceType === "OFFICE" && (
              <div className="office-queue-explainer">
                <strong>Same-day walk-in line · not an appointment</strong>
                <p>
                  Joining does not guarantee a meeting time. Estimates may
                  change while the office is in a meeting. Stay nearby and go to
                  the office only after your ticket is called.
                </p>
              </div>
            )}
            <label>
              {t.reason}
              <select
                value={reason || s.visitReasonOptions[0]}
                onChange={(e) => {
                  setReason(e.target.value);
                  key.current = null;
                }}
              >
                {s.visitReasonOptions.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            {s.allowNote && (
              <label>
                {t.optionalNote} <span className="muted">(optional)</span>
                <textarea
                  maxLength={240}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    key.current = null;
                  }}
                  placeholder="Keep it brief. Do not include sensitive information."
                />
                <small>
                  {note.length}/240 · Visible only to you and authorized staff
                </small>
              </label>
            )}
            <div className="ownership">
              <LockKeyhole size={18} />
              <p>
                Your private ticket belongs to this browser. Clearing cookies or
                switching devices may lose self-service access.
              </p>
            </div>
            <ErrorBox error={join.error} />
            {existing ? (
              <div className="notice">
                You already have an active ticket for this service today.
                <Link className="button full" href={`/tickets/${existing}`}>
                  Open your existing ticket
                </Link>
              </div>
            ) : (
              <button
                className="button full"
                disabled={!canJoin || join.isPending || !!q.error}
              >
                {join.isPending
                  ? "Saving your place…"
                  : queueFull
                    ? "Queue is full"
                    : s.joiningOpen
                      ? ur
                        ? "میرا ٹکٹ حاصل کریں"
                        : "Get my ticket"
                      : "Joining currently unavailable"}
                <ArrowRight size={17} />
              </button>
            )}
            <small>
              By joining, you agree to the one-rejoin missed-turn policy.
            </small>
          </form>
        </aside>
      </div>
    </main>
  );
}
export function TicketView({ publicId }: { publicId: string }) {
  const q = useLive<PrivateTicket>(`tickets/${publicId}`, 3000);
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const cancelTrigger = useRef<HTMLButtonElement | null>(null);
  const [sound, setSound] = useState(false);
  const lastStatus = useRef<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const { ur, t: text } = useLocale();
  const action = useMutation({
    mutationFn: (a: "cancel" | "rejoin") => api(`tickets/${publicId}/${a}`, {}),
    onSuccess: () => {
      setConfirm(false);
      client.invalidateQueries();
    },
  });
  // A restrained status announcer also handles the optional sound after explicit activation.
  const status = q.data?.status;
  useEffect(() => {
    if (status && status !== lastStatus.current) {
      if (lastStatus.current && status === "CALLED" && sound && audio.current) {
        const osc = audio.current.createOscillator();
        const gain = audio.current.createGain();
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(audio.current.destination);
        osc.start();
        osc.stop(audio.current.currentTime + 0.35);
      }
      lastStatus.current = status;
    }
  }, [status, sound]);
  if (!q.data)
    return (
      <main className="page narrow">
        <ErrorBox error={q.error} />
        {q.error ? (
          <p>
            Use the browser that joined this queue.{" "}
            <Link href="/my-tickets">My tickets</Link>
          </p>
        ) : (
          <Loading />
        )}
      </main>
    );
  const t = q.data;
  const terminal = ["COMPLETED", "CANCELLED", "EXPIRED"].includes(t.status);
  return (
    <main className="page ticket-page" dir={ur ? "rtl" : "ltr"}>
      <Link href={`/services/${t.service.slug}`} className="back-link">
        <ArrowLeft size={16} /> {t.service.name}
      </Link>
      <div className="ticket-layout">
        <section className="panel ticket-main">
          <div className="ticket-top">
            <span className="eyebrow">{text.privateTicket}</span>
            <LockKeyhole size={18} />
          </div>
          <Badge state={t.status} />
          <div className="token" dir="ltr">
            {t.tokenLabel}
          </div>
          <h1>{t.service.name}</h1>
          <Location location={t.service.location} />
          <p className="muted">{t.localDate} · Campus time (PKT)</p>
          <div
            className={`ticket-message ${t.status.toLowerCase()}`}
            aria-live="polite"
          >
            {t.status === "CALLED" ? (
              <>
                <strong>
                  {t.service.serviceType === "OFFICE"
                    ? `Please go to ${t.service.name} · ${t.service.location} now.`
                    : `Please go to ${t.counter?.name}.`}
                </strong>
                <p>
                  {t.service.serviceType === "OFFICE"
                    ? `Your call window is ${t.service.gracePeriodSeconds} seconds from ${t.calledAt ? new Date(t.calledAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", timeZone: t.service.timezone }) : "now"} PKT. The officer will mark a missed turn only after this window.`
                    : "Your turn is here. Staff will start your visit when you arrive."}
                </p>
              </>
            ) : t.status === "SERVING" ? (
              <>
                <strong>You’re being helped at {t.counter?.name}.</strong>
                <p>Your visit is in progress.</p>
              </>
            ) : t.status === "COMPLETED" ? (
              <>
                <CheckCircle2 size={28} />
                <strong>{text.completed}</strong>
                <p>Thank you for using QueueFair.</p>
              </>
            ) : t.status === "MISSED" ? (
              <>
                <strong>{text.missed}</strong>
                <p>
                  {t.canRejoin
                    ? "You can rejoin once, at the back of the queue."
                    : t.rejoinCount
                      ? "Your one rejoin has been used."
                      : "Rejoin is unavailable outside today’s opening hours."}
                </p>
              </>
            ) : terminal ? (
              <strong>This ticket is {t.status.toLowerCase()}.</strong>
            ) : (
              <>
                <strong>{text.placeSaved}</strong>
                <p>Keep this page open and watch for your counter.</p>
              </>
            )}
          </div>
          {t.status === "WAITING" && (
            <>
              <div className="large-metrics">
                <div>
                  <strong>{t.ahead}</strong>
                  <span>{text.ahead}</span>
                </div>
                <div>
                  <strong>{t.estimate.label}</strong>
                  <span>{t.estimate.source}</span>
                </div>
              </div>
              <EstimatePanel estimate={t.estimate} />
            </>
          )}
          {t.service.serviceType === "OFFICE" && (
            <p className="office-queue-explainer">
              This is a same-day walk-in line, not an appointment or guaranteed
              meeting time. Wait for your ticket to be called before going to
              the office. If plans change, you can cancel while waiting or after
              being called.
            </p>
          )}
          {t.service.pauseReason && (
            <p className="notice">{t.service.pauseReason}</p>
          )}
          {(t.visitReasonCode || t.note) && (
            <div className="ticket-private-details">
              <h2>Your visit details</h2>
              {t.visitReasonCode && <p>Reason: {t.visitReasonCode}</p>}
              {t.note && <p>Your note: {t.note}</p>}
              <small>
                These details are private to you and assigned staff.
              </small>
            </div>
          )}
          <Sync error={q.error} at={t.syncedAt} />
          <ErrorBox error={action.error} />
          <div className="ticket-actions no-print">
            <button className="button outline" onClick={() => window.print()}>
              <Printer size={16} /> {text.print}
            </button>
            <button
              className="button outline"
              onClick={() => {
                if (!audio.current) audio.current = new AudioContext();
                audio.current.resume();
                setSound((v) => !v);
              }}
              aria-pressed={sound}
            >
              <Volume2 size={16} />
              {sound ? "Sound on" : "Enable sound"}
            </button>
            {["WAITING", "CALLED", "MISSED"].includes(t.status) && (
              <button
                className="button danger-outline"
                ref={cancelTrigger}
                onClick={() => setConfirm(true)}
              >
                Cancel ticket
              </button>
            )}
            {t.canRejoin && (
              <button
                className="button"
                disabled={action.isPending || !!q.error}
                onClick={() => action.mutate("rejoin")}
              >
                {action.isPending ? "Rejoining…" : "Rejoin at the back"}
              </button>
            )}
          </div>
          <p className="ownership-note">
            Ownership is tied to this browser’s cookies. Your public ticket link
            alone does not grant access.
          </p>
        </section>
        <aside className="stack">
          <div className="panel">
            <h2>{text.timeline}</h2>
            <ol className="timeline">
              {t.events.map((e) => (
                <li key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{e.type.replaceAll("_", " ").toLowerCase()}</strong>
                    <time>
                      {new Date(e.at).toLocaleTimeString("en-PK", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: t.service.timezone,
                      })}{" "}
                      PKT
                    </time>
                    {e.type === "CALLED" && (
                      <small>
                        {String(
                          (e.metadata as { counter?: string }).counter ?? "",
                        )}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Policy />
        </aside>
      </div>
      {confirm && (
        <Confirm
          onClose={() => {
            setConfirm(false);
            setTimeout(() => cancelTrigger.current?.focus(), 0);
          }}
          onConfirm={() => action.mutate("cancel")}
          pending={action.isPending}
          error={action.error}
        />
      )}
    </main>
  );
}
function Confirm({
  onClose,
  onConfirm,
  pending,
  error,
}: {
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: unknown;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      onCancel={onClose}
      onClose={onClose}
    >
      <h2>Cancel your ticket?</h2>
      <p>Your place in this queue will be released.</p>
      <ErrorBox error={error} />
      <div className="actions">
        <button
          className="button outline"
          autoFocus
          disabled={pending}
          onClick={onClose}
        >
          Keep my ticket
        </button>
        <button
          className="button danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Cancelling…" : "Yes, cancel ticket"}
        </button>
      </div>
    </dialog>
  );
}
export function MyTickets() {
  const q = useLive<PrivateTicket[]>("me/tickets", 3000);
  return (
    <main className="page narrow">
      <span className="eyebrow">SAVED IN THIS BROWSER</span>
      <h1>My tickets</h1>
      <p>Keep track of your campus visits, all in one place.</p>
      <ErrorBox error={q.error} />
      {!q.data ? (
        <Loading />
      ) : q.data.length ? (
        <div className="stack">
          {q.data.map((t) => (
            <Link
              className="panel ticket-list-item"
              key={t.publicId}
              href={`/tickets/${t.publicId}`}
            >
              <div>
                <strong className="mini-token">{t.tokenLabel}</strong>
                <p>
                  {t.service.name} · {t.localDate}
                </p>
              </div>
              <Badge state={t.status} />
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty>
          No tickets in this browser yet. <Link href="/">Find a service</Link>{" "}
          to save your place.
        </Empty>
      )}
      <p className="muted">
        Clearing cookies or using another device may lose access to private
        tickets.
      </p>
    </main>
  );
}
export function Display({ slug }: { slug: string }) {
  const q = useLive<PublicService[]>("services", 3000);
  const { ur, t } = useLocale();
  const s = q.data?.find((s) => s.slug === slug);
  if (!s)
    return (
      <main className="page">
        <ErrorBox error={q.error} />
        {q.data ? <h1>Service not found</h1> : <Loading />}
      </main>
    );
  return (
    <main className="display-page" dir={ur ? "rtl" : "ltr"}>
      <div className="display-header">
        <div>
          <span className="eyebrow">
            CEDAR CAMPUS · {s.demo ? "DEMO DATA" : "CAMPUS SERVICES"}
          </span>
          <h1>{s.name}</h1>
          <Location location={s.location} />
        </div>
        <div>
          <Badge
            state={
              s.joiningOpen ? "OPEN" : s.state === "OPEN" ? "CLOSED" : s.state
            }
          />
          <p>
            {new Date(s.syncedAt).toLocaleTimeString("en-PK", {
              timeZone: "Asia/Karachi",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            PKT
          </p>
        </div>
      </div>
      {(s.pauseReason || s.notice) && (
        <div className="notice display-notice">
          {s.pauseReason} {s.notice}
        </div>
      )}
      <h2>{t.nowServing}</h2>
      <div className="display-counters">
        {s.counters.map((c) => (
          <article className="panel" key={c.id}>
            <h3>{c.name}</h3>
            <div className="display-token" dir="ltr">
              {c.current?.tokenLabel ?? "—"}
            </div>
            <Badge
              state={
                c.current?.status ??
                (c.state === "ACTIVE" ? "CONFIGURED ACTIVE" : c.state)
              }
            />
            {c.pauseReason && <p>{c.pauseReason}</p>}
          </article>
        ))}
      </div>
      <div className="display-bottom">
        <div>
          <h2>{t.comingNext}</h2>
          <div className="next-tokens" dir="ltr">
            {s.next.length ? (
              s.next.map((t) => <span key={t.tokenLabel}>{t.tokenLabel}</span>)
            ) : (
              <p>No tickets waiting</p>
            )}
          </div>
          <p>
            {s.waitingCount === 0
              ? `No one waiting · Joining is ${s.joiningOpen ? "open" : s.state.toLowerCase()}`
              : `${s.waitingCount} people waiting · ${s.estimate.label}`}
          </p>
        </div>
        <div className="qr-block">
          <QRCodeSVG
            value={`${typeof window === "undefined" ? "" : window.location.origin}/services/${slug}`}
            size={112}
            title="Scan to join this service"
          />
          <div>
            <h3>{t.savePlace}</h3>
            <p>Scan to join this queue.</p>
            <small>No personal details shown here.</small>
          </div>
        </div>
      </div>
      <Sync error={q.error} at={s.syncedAt} />
    </main>
  );
}
