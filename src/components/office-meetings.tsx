"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  ExternalLink,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  officeDirectory,
  officeDetail,
  meetingRequestDetail,
  myMeetingRequests,
  officeInbox,
} from "@/server/meetings";
import { api, Badge, Empty, ErrorBox, Loading, Sync, useLive } from "./shared";
import { useLocale } from "./providers";

type OfficeDirectoryData = Awaited<ReturnType<typeof officeDirectory>>;
type OfficeDetailData = Awaited<ReturnType<typeof officeDetail>>;
type MeetingDetail = Awaited<ReturnType<typeof meetingRequestDetail>>;
type MeetingList = Awaited<ReturnType<typeof myMeetingRequests>>;
type MeetingInbox = Awaited<ReturnType<typeof officeInbox>>;
const url = (slug: string) => `/offices/${slug}`;
const toUtc = (value: string) =>
  fromZonedTime(value, "Asia/Karachi").toISOString();
const localTime = (iso?: string | null) =>
  iso
    ? formatInTimeZone(
        new Date(iso),
        "Asia/Karachi",
        "EEE, d MMM yyyy · h:mm a",
      ) + " PKT"
    : "Not set";
const title = (status: string) =>
  ({
    REQUESTED: "Needs office review",
    ACCEPTED: "Accepted by the office",
    REJECTED: "Not accepted",
    RESCHEDULE_PROPOSED: "Awaiting your response",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
  })[status] ?? status;
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hoursLabel = (hours: { days: number[]; open: string; close: string }) =>
  `${hours.days.map((day) => weekdayNames[day]).join(", ")} · ${hours.open}–${hours.close} PKT`;
const eventTitle = (type: string) =>
  ({
    REQUESTED: "Request submitted",
    ACCEPTED: "Meeting time accepted by office",
    REJECTED: "Request declined",
    RESCHEDULE_PROPOSED: "Office proposed a different time",
    PROPOSAL_ACCEPTED: "Proposed time accepted",
    PROPOSAL_DECLINED_REQUEUED: "Proposal declined · returned to review queue",
    PROPOSAL_DECLINED_KEPT_ACCEPTED_TIME:
      "Proposal declined · original time retained",
    CANCELLED: "Request cancelled",
    COMPLETED: "Meeting marked complete",
  })[type] ?? type.replaceAll("_", " ").toLowerCase();

export function ReferenceDisclaimer({ text }: { text: string }) {
  return (
    <aside className="reference-disclaimer" role="note">
      <ShieldCheck size={18} aria-hidden="true" />
      <span>{text}</span>
    </aside>
  );
}

function LoadState({ error, retry }: { error: unknown; retry: () => void }) {
  return error ? (
    <section className="empty-state office-load-error" role="status">
      <ErrorBox error={error} />
      <button className="button outline" onClick={retry}>
        Try again
      </button>
    </section>
  ) : (
    <Loading />
  );
}

export function OfficeDirectory() {
  const q = useLive<OfficeDirectoryData>("offices", 30000);
  const { ur } = useLocale();
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const filtered = useMemo(() => {
    const offices = q.data?.offices ?? [];
    const term = search.trim().toLowerCase();
    return offices.filter((office) => {
      const matches =
        `${office.name} ${office.positionTitle ?? ""} ${office.description}`
          .toLowerCase()
          .includes(term);
      return (
        matches &&
        (!selectedGroup ||
          office.parentServiceId === selectedGroup ||
          office.id === selectedGroup)
      );
    });
  }, [q.data, search, selectedGroup]);
  if (!q.data)
    return (
      <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
        <LoadState error={q.error} retry={() => void q.refetch()} />
      </main>
    );
  const roots = filtered.filter((office) => !office.parentServiceId);
  const childMap = new Map<string, typeof filtered>();
  filtered.forEach((office) => {
    if (!office.parentServiceId) return;
    childMap.set(office.parentServiceId, [
      ...(childMap.get(office.parentServiceId) ?? []),
      office,
    ]);
  });
  return (
    <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
      <div className="office-kicker">
        <span className="eyebrow">OFFICE DIRECTORY · ROUTING REFERENCE</span>
        <span className="demo-label">
          No employee contact details · no implied access
        </span>
      </div>
      <header className="office-heading">
        <div>
          <h1>Meet with an office</h1>
          <p>
            Send a private request for an office to review. A preferred time is
            only a preference until an authorized officer accepts it.
          </p>
        </div>
        <Link className="button outline" href="/my-meetings">
          My requests <ArrowRight size={17} />
        </Link>
      </header>
      {q.data.disclaimer && <ReferenceDisclaimer text={q.data.disclaimer} />}
      <p className="routing-note">
        The public directory is used as a routing taxonomy reference. Parent
        relationships shown here are inferred for navigation and never grant
        permissions. QueueFair is an independent prototype.
      </p>
      <div className="office-toolbar">
        <label className="search">
          <Search size={18} />
          <span className="sr-only">Search offices</span>
          <input
            aria-label="Search offices"
            placeholder="Search offices or roles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter by routing group</span>
          <select
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
          >
            <option value="">All offices</option>
            {q.data.offices
              .filter((office) => office.directoryGroup)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <Empty>
          No offices match that search. Try a different name or role.
        </Empty>
      ) : (
        <div className="office-directory-list">
          {roots.map((office) => (
            <section className="office-group" key={office.id}>
              <div className="office-group-head">
                <div>
                  <span className="eyebrow">
                    {office.directoryGroup ? "ROUTING GROUP" : "OFFICE"}
                  </span>
                  <h2>
                    <Link href={url(office.slug)}>{office.name}</Link>
                  </h2>
                  <p>{office.description}</p>
                </div>
                {office.officeSourceUrl && (
                  <SourceLink href={office.officeSourceUrl} />
                )}
              </div>
              <div className="office-card-grid">
                {(childMap.get(office.id) ?? []).map((child) => (
                  <OfficeCard
                    key={child.id}
                    office={child}
                    sourceUrl={child.officeSourceUrl}
                  />
                ))}
              </div>
              {childMap.has(office.id) === false && (
                <OfficeCard
                  office={office}
                  sourceUrl={office.officeSourceUrl}
                />
              )}
            </section>
          ))}
          {filtered
            .filter(
              (office) =>
                office.parentServiceId &&
                !roots.some((parent) => parent.id === office.parentServiceId),
            )
            .map((office) => (
              <OfficeCard
                key={office.id}
                office={office}
                sourceUrl={office.officeSourceUrl}
              />
            ))}
        </div>
      )}
      <Sync error={q.error} />
    </main>
  );
}

function SourceLink({ href }: { href: string }) {
  return (
    <a className="source-link" href={href} target="_blank" rel="noreferrer">
      Public source <ExternalLink size={14} />
    </a>
  );
}

function OfficeCard({
  office,
  sourceUrl,
}: {
  office: OfficeDirectoryData["offices"][number];
  sourceUrl?: string | null;
}) {
  return (
    <article className="office-card">
      <div className="office-card-top">
        <span className="office-index" aria-hidden="true">
          {office.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h3>
            <Link href={url(office.slug)}>{office.name}</Link>
          </h3>
          {office.positionTitle && (
            <p className="office-role">{office.positionTitle}</p>
          )}
        </div>
      </div>
      <p>{office.description}</p>
      <span className="muted inline">
        <MapPin size={14} />
        {office.location}
      </span>
      <small className="office-hours-label">
        {hoursLabel(office.weeklyHours)}
      </small>
      <div className="office-card-state">
        <strong>
          {office.waitingCount === 0
            ? "No one waiting"
            : `${office.waitingCount} waiting`}
        </strong>
        <span>
          {office.configuredCounters === 0
            ? "No walk-in line configured"
            : office.joiningOpen
              ? "Walk-in joining is open"
              : office.state === "PAUSED"
                ? `Walk-in line paused${office.pauseReason ? ` · ${office.pauseReason}` : ""}`
                : office.state === "CLOSED"
                  ? `Walk-in line closed${office.pauseReason ? ` · ${office.pauseReason}` : ""}`
                  : "Walk-in joining is outside office hours"}
        </span>
        <small>
          {office.configuredCounters === 0
            ? "No walk-in wait estimate"
            : office.waitingCount === 0
              ? "No estimate needed while nobody is waiting"
              : office.estimateLabel}
        </small>
      </div>
      <div className="office-card-actions">
        {office.meetingRequestsEnabled ? (
          <Link className="button small" href={url(office.slug)}>
            Request a meeting <ArrowRight size={15} />
          </Link>
        ) : (
          <Link className="button outline small" href={url(office.slug)}>
            View office details <ArrowRight size={15} />
          </Link>
        )}
        {office.configuredCounters > 0 ? (
          <Link className="text-link" href={`/services/${office.slug}`}>
            View walk-in queue
          </Link>
        ) : (
          <span className="muted small-copy">
            No QueueFair walk-in line configured
          </span>
        )}
      </div>
      {sourceUrl && <SourceLink href={sourceUrl} />}
    </article>
  );
}

export function OfficeDetailView({ slug }: { slug: string }) {
  const q = useLive<OfficeDetailData>(`offices/${slug}`, 30000);
  const { ur } = useLocale();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const request = useMutation({
    mutationFn: async () => {
      await api("auth/anonymous", {});
      return api<{ publicId: string; existing: boolean }>(
        `offices/${q.data!.office.id}/requests`,
        {
          reason: reason || q.data!.office.meetingRequestReasonOptions[0],
          ...(note ? { note } : {}),
          ...(preferredAt ? { preferredAt: toUtc(preferredAt) } : {}),
        },
        "POST",
        key,
      );
    },
    onSuccess: (result) => {
      router.push(
        `/meeting-requests/${result.publicId}${result.existing ? "?existing=1" : ""}`,
      );
    },
  });
  if (!q.data)
    return (
      <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
        <LoadState error={q.error} retry={() => void q.refetch()} />
      </main>
    );
  const office = q.data.office;
  if (office.directoryGroup)
    return (
      <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
        <Link className="back-link" href="/offices">
          <ArrowLeft size={16} /> Office directory
        </Link>
        {q.data.disclaimer && <ReferenceDisclaimer text={q.data.disclaimer} />}
        <span className="eyebrow">
          ROUTING GROUP · NOT AN AUTHORIZATION RULE
        </span>
        <h1>{office.name}</h1>
        {office.officeSourceUrl && <SourceLink href={office.officeSourceUrl} />}
        <p>{office.description}</p>
        <p className="routing-note">
          This parent-child grouping is an inferred navigation reference only.
          Only an administrator’s explicit staff assignment grants inbox access.
        </p>
        <div className="office-card-grid">
          {office.children.map((child) => (
            <article className="office-card" key={child.id}>
              <span className="eyebrow">ROUTING REFERENCE</span>
              <h2>
                <Link href={url(child.slug)}>{child.name}</Link>
              </h2>
              {child.positionTitle && (
                <p className="office-role">{child.positionTitle}</p>
              )}
              <p>
                Parent grouping is for navigation only. Inbox access requires a
                separate explicit assignment.
              </p>
              <Link className="text-link" href={url(child.slug)}>
                View office details <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      </main>
    );
  return (
    <main className="page office-page">
      <Link className="back-link" href="/offices">
        <ArrowLeft size={16} /> Office directory
      </Link>
      {q.data.disclaimer && <ReferenceDisclaimer text={q.data.disclaimer} />}
      {q.data.office.parent && (
        <p className="muted">
          Routing reference:{" "}
          <Link href={url(q.data.office.parent.slug)}>
            {q.data.office.parent.name}
          </Link>{" "}
          · this does not grant access.
        </p>
      )}
      <header className="office-detail-heading">
        <div>
          <span className="eyebrow">
            OFFICE REQUESTS · NOT A BOOKING GUARANTEE
          </span>
          <h1>{office.name}</h1>
          {office.positionTitle && (
            <p className="office-role">{office.positionTitle}</p>
          )}
          <p>{office.description}</p>
          <span className="muted inline">
            <MapPin size={15} />
            {office.location}
          </span>
        </div>
        {office.officeSourceUrl && <SourceLink href={office.officeSourceUrl} />}
      </header>
      <div className="office-detail-grid">
        <section className="stack">
          <div className="panel office-live-state">
            <span className="eyebrow">SAME-DAY WALK-IN STATUS</span>
            <strong>
              {office.configuredCounters === 0
                ? "No walk-in line configured"
                : office.waitingCount === 0
                  ? "No one waiting"
                  : `${office.waitingCount} people waiting`}
            </strong>
            <span>
              {office.configuredCounters === 0
                ? "Meeting requests are handled separately."
                : office.joiningOpen
                  ? "Joining is open during office hours."
                  : office.pauseReason ||
                    "Walk-in joining is currently unavailable."}
            </span>
            <small>
              {office.configuredCounters === 0
                ? "Walk-in estimate unavailable."
                : office.waitingCount === 0
                  ? "No estimate needed while nobody is waiting."
                  : office.estimateLabel}
            </small>
          </div>
          <div className="panel">
            <h2>Before you request</h2>
            <ul className="document-list">
              <li>
                <Check size={16} />A request enters the office’s review queue;
                it is not confirmed until an officer accepts a time.
              </li>
              <li>
                <Check size={16} />
                Response timing is not guaranteed. A preferred time is a
                preference, not a reservation.
              </li>
              <li>
                <Check size={16} />
                QueueFair does not send email or SMS. Return to this page to see
                updates.
              </li>
              <li>
                <Check size={16} />
                Do not include student IDs, CNICs, contact details, or sensitive
                case information.
              </li>
            </ul>
            <div className="facts">
              <span>
                <Clock3 size={15} />
                {hoursLabel(office.weeklyHours)}
              </span>
              <span>
                <CalendarClock size={15} />
                {office.meetingDurationMinutes} minutes · up to{" "}
                {office.meetingBookingHorizonDays} days ahead
              </span>
              <span>
                <Users size={15} />
                Review queue only · no response-time estimate
              </span>
            </div>
          </div>
          <div className="panel walk-in-panel">
            <h2>Same-day walk-in line</h2>
            {office.configuredCounters > 0 ? (
              <>
                <p>
                  {office.waitingCount === 0
                    ? "No one is waiting. "
                    : `${office.waitingCount} people are waiting. `}
                  {office.joiningOpen
                    ? "The same-day FIFO line is open."
                    : office.pauseReason ||
                      "The same-day line is not accepting joins."}
                  This line is separate from meeting requests.
                </p>
                <Link className="button outline" href={`/services/${slug}`}>
                  View walk-in queue <ArrowRight size={16} />
                </Link>
              </>
            ) : (
              <p>
                This office currently has no QueueFair walk-in line configured.
                Meeting requests are reviewed separately.
              </p>
            )}
          </div>
        </section>
        <form
          className="panel meeting-request-form"
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate();
          }}
        >
          <span className="eyebrow">PRIVATE OFFICE REQUEST</span>
          <h2>Ask the office to review</h2>
          {!office.meetingRequestsEnabled ? (
            <div className="notice">
              Meeting requests are not configured for this directory reference.
              An administrator must configure office hours, topics, and an
              explicit staff assignment first.
            </div>
          ) : (
            <>
              <label>
                What would you like to discuss?
                <select
                  value={reason || office.meetingRequestReasonOptions[0] || ""}
                  required
                  onChange={(event) => {
                    setReason(event.target.value);
                    setKey(crypto.randomUUID());
                  }}
                >
                  {office.meetingRequestReasonOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              {office.allowNote && (
                <label>
                  Brief context{" "}
                  <span className="muted">(optional, max 240 characters)</span>
                  <textarea
                    maxLength={240}
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setKey(crypto.randomUUID());
                    }}
                    placeholder="Keep it brief. Do not include sensitive information."
                  />
                  <small>
                    {note.length}/240 · Visible only to you and assigned office
                    staff.
                  </small>
                </label>
              )}
              <label>
                Preferred time{" "}
                <span className="muted">(optional; not a reservation)</span>
                <input
                  type="datetime-local"
                  value={preferredAt}
                  onChange={(event) => {
                    setPreferredAt(event.target.value);
                    setKey(crypto.randomUUID());
                  }}
                />
                <small>
                  Times are interpreted in Asia/Karachi. The office may accept,
                  reject, or propose another time.
                </small>
              </label>
              <p className="ownership-note">
                Your request is private to this browser. Clearing cookies can
                remove your ability to follow or cancel it.
              </p>
              <ErrorBox error={request.error} />
              <button className="button full" disabled={request.isPending}>
                {request.isPending
                  ? "Sending request…"
                  : "Send request for review"}
                <ArrowRight size={16} />
              </button>
              <small>
                Sending means you are joining a review queue, not booking a
                meeting.
              </small>
            </>
          )}
        </form>
      </div>
      <Sync error={q.error} />
    </main>
  );
}

export function MyMeetingsView() {
  const q = useLive<MeetingList>("me/meeting-requests", 5000);
  const { ur } = useLocale();
  if (!q.data)
    return (
      <main className="page" dir={ur ? "rtl" : "ltr"}>
        <LoadState error={q.error} retry={() => void q.refetch()} />
      </main>
    );
  return (
    <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
      <h1>My office requests</h1>
      <p>Private meeting requests linked to this browser.</p>
      {q.data[0]?.officeDisclaimer && (
        <ReferenceDisclaimer text={q.data[0].officeDisclaimer} />
      )}
      {q.data.length === 0 ? (
        <Empty>
          You have no meeting requests in this browser yet.{" "}
          <Link href="/offices">Browse offices</Link>
        </Empty>
      ) : (
        <div className="meeting-request-list">
          {q.data.map((request) => (
            <MeetingSummary key={request.publicId} request={request} />
          ))}
        </div>
      )}
      <Sync error={q.error} />
    </main>
  );
}

function MeetingSummary({ request }: { request: MeetingList[number] }) {
  return (
    <Link
      className="panel meeting-summary"
      href={`/meeting-requests/${request.publicId}`}
    >
      <div>
        <span className="token-label" dir="ltr">
          {request.reference}
        </span>
        <Badge state={request.status} />
      </div>
      <h2>{request.office.name}</h2>
      <p>
        {title(request.status)}
        {request.status === "REQUESTED" && request.reviewAhead !== null
          ? ` · ${request.reviewAhead} ahead for review`
          : ""}
      </p>
      <span className="muted">
        {localTime(
          request.scheduledAt ?? request.proposedAt ?? request.submittedAt,
        )}
      </span>
    </Link>
  );
}

export function MeetingRequestView({ publicId }: { publicId: string }) {
  const q = useLive<MeetingDetail>(`meeting-requests/${publicId}`, 3000);
  const { ur } = useLocale();
  const client = useQueryClient();
  const search = useSearchParams();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const existing = search.get("existing") === "1";
  const action = useMutation({
    mutationFn: (choice: "cancel" | "accept-proposal" | "decline-proposal") =>
      api(
        `meeting-requests/${publicId}/${choice === "cancel" ? "cancel" : "respond"}`,
        choice === "cancel" ? {} : { action: choice },
        "POST",
        crypto.randomUUID(),
      ),
    onSuccess: () => {
      setConfirmCancel(false);
      client.invalidateQueries();
    },
  });
  if (!q.data)
    return (
      <main className="page" dir={ur ? "rtl" : "ltr"}>
        <LoadState error={q.error} retry={() => void q.refetch()} />
      </main>
    );
  const request = q.data;
  return (
    <main className="page office-page" dir={ur ? "rtl" : "ltr"}>
      <Link className="back-link" href="/my-meetings">
        <ArrowLeft size={16} /> My office requests
      </Link>
      {request.officeDisclaimer && (
        <ReferenceDisclaimer text={request.officeDisclaimer} />
      )}
      {existing && (
        <div className="notice">
          You already had an active request for this office. This browser has
          reopened it.
        </div>
      )}
      <div className="meeting-detail-grid">
        <section
          className={`meeting-reference-card ${request.status.toLowerCase()}`}
        >
          <span className="eyebrow">PRIVATE REQUEST REFERENCE</span>
          <strong className="token-label" dir="ltr">
            {request.reference}
          </strong>
          <Badge state={request.status} />
          <h1>{request.office.name}</h1>
          <p>{title(request.status)}</p>
          <span className="muted inline">
            <MapPin size={15} />
            {request.office.location}
          </span>
          {request.status === "REQUESTED" && (
            <div className="review-position">
              <strong>{request.reviewPosition}</strong>
              <span>in the office review order</span>
              <small>
                This position does not predict when the office will respond.
              </small>
            </div>
          )}
          {request.status === "ACCEPTED" && (
            <div className="accepted-time">
              <CalendarClock size={19} />
              <span>
                <strong>Accepted by the office</strong>
                {localTime(request.scheduledAt)} · {request.durationMinutes}{" "}
                minutes
              </span>
            </div>
          )}
          {request.status === "RESCHEDULE_PROPOSED" && (
            <div className="proposal-time">
              <strong>Office proposed · awaiting your reply</strong>
              <span>{localTime(request.proposedAt)}</span>
              {request.scheduledAt && (
                <small>
                  Your previously accepted time remains confirmed until you
                  respond: {localTime(request.scheduledAt)}
                </small>
              )}
            </div>
          )}
        </section>
        <section className="stack">
          <div className="panel">
            <h2>Request details</h2>
            <dl className="meeting-facts">
              <div>
                <dt>Topic</dt>
                <dd>{request.reason}</dd>
              </div>
              {request.note && (
                <div>
                  <dt>Your private note</dt>
                  <dd>{request.note}</dd>
                </div>
              )}
              <div>
                <dt>Preferred time</dt>
                <dd>{localTime(request.preferredAt)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{localTime(request.submittedAt)}</dd>
              </div>
            </dl>
            <p className="notice">
              This is an office-reviewed request, not a guaranteed appointment.
              QueueFair does not send email or SMS. Return here to see office
              decisions.
            </p>
            {request.decisionReason && (
              <p className="decision-reason">
                <strong>Office note:</strong> {request.decisionReason}
              </p>
            )}
          </div>
          {request.status === "RESCHEDULE_PROPOSED" && (
            <div className="panel proposal-actions">
              <h2>Respond to the proposed time</h2>
              <p>
                If you decline a first proposal, your request returns to the
                review queue tail. If you already had an accepted time, that
                original time remains accepted.
              </p>
              <div className="button-row">
                <button
                  className="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("accept-proposal")}
                >
                  Accept proposed time
                </button>
                <button
                  className="button outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate("decline-proposal")}
                >
                  Decline proposal
                </button>
              </div>
            </div>
          )}
          {request.canCancel && (
            <button
              className="button danger outline"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel request
            </button>
          )}
          {!request.canCancel &&
            ["REQUESTED", "ACCEPTED", "RESCHEDULE_PROPOSED"].includes(
              request.status,
            ) && (
              <p className="muted">
                The cancellation cutoff has passed. Please contact the office
                directly.
              </p>
            )}
          {confirmCancel && (
            <div className="confirm-overlay">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-meeting-title"
                className="confirm-dialog"
              >
                <h2 id="cancel-meeting-title">Cancel this office request?</h2>
                <p>
                  {request.status === "ACCEPTED"
                    ? "This releases the accepted time if it is still within the cancellation window."
                    : "The office review position and request will be closed."}
                </p>
                <div className="button-row">
                  <button
                    className="button outline"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep request
                  </button>
                  <button
                    className="button danger"
                    disabled={action.isPending}
                    onClick={() => action.mutate("cancel")}
                  >
                    Yes, cancel request
                  </button>
                </div>
              </section>
            </div>
          )}
          <ErrorBox error={action.error} />
          <div className="panel">
            <h2>Request history</h2>
            <ol className="meeting-timeline">
              {request.events.map((event, index) => {
                const metadata = event.metadata as { reason?: unknown };
                return (
                  <li key={`${event.type}-${event.at}-${index}`}>
                    <span className="timeline-mark" />
                    <div>
                      <strong>{eventTitle(event.type)}</strong>
                      <time>{localTime(event.at)}</time>
                      {typeof metadata.reason === "string" && (
                        <p>{metadata.reason}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>
      <Sync error={q.error} at={request.syncedAt} />
    </main>
  );
}

export function StaffMeetingInbox() {
  const [officeId, setOfficeId] = useState("");
  const [status, setStatus] = useState("");
  const path = `staff/meetings${officeId || status ? `?${new URLSearchParams({ ...(officeId ? { officeId } : {}), ...(status ? { status } : {}) })}` : ""}`;
  const q = useLive<MeetingInbox>(path, 2000);
  const client = useQueryClient();
  const [times, setTimes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decision = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) =>
      api(`staff/meetings/${id}/decision`, body, "POST", crypto.randomUUID()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["staff/meetings"] }),
  });
  if (!q.data)
    return (
      <main className="page">
        <ErrorBox error={q.error} />
        <Loading />
      </main>
    );
  const groups: [string, MeetingInbox["groups"]["review"]][] = [
    ["Needs review", q.data.groups.review],
    ["Awaiting student response", q.data.groups.awaitingStudent],
    ["Upcoming accepted", q.data.groups.upcoming],
    ["Closed", q.data.groups.closed],
  ];
  return (
    <main className="page office-page">
      <span className="eyebrow">ASSIGNED OFFICE INBOX</span>
      <header className="office-heading">
        <div>
          <h1>Meeting requests</h1>
          <p>Review order is visible; it does not predict response time.</p>
        </div>
        <Badge state="FIFO REVIEW" />
      </header>
      {q.data.disclaimer && <ReferenceDisclaimer text={q.data.disclaimer} />}
      <div className="meeting-filters">
        <label>
          Assigned office
          <select
            value={officeId}
            onChange={(event) => setOfficeId(event.target.value)}
          >
            <option value="">All assigned offices</option>
            {q.data.offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status filter
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {[
              "REQUESTED",
              "RESCHEDULE_PROPOSED",
              "ACCEPTED",
              "REJECTED",
              "CANCELLED",
              "COMPLETED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {q.data.offices.length === 0 ? (
        <Empty>
          No office inbox is assigned to this account. Ask an administrator to
          assign an office explicitly.
        </Empty>
      ) : (
        groups.map(
          ([heading, items]) =>
            items.length > 0 && (
              <section className="meeting-inbox-group" key={heading}>
                <div className="section-heading">
                  <h2>{heading}</h2>
                  <span className="count">{items.length}</span>
                </div>
                {items.map((request) => (
                  <article
                    className="panel meeting-inbox-card"
                    key={request.id}
                  >
                    <div className="meeting-inbox-head">
                      <div>
                        <span className="token-label" dir="ltr">
                          {request.reference}
                        </span>
                        <h3>{request.office.name}</h3>
                        <span className="muted">
                          {request.office.location} ·{" "}
                          {request.reviewPosition
                            ? `#${request.reviewPosition} in review order`
                            : title(request.status)}
                        </span>
                      </div>
                      <Badge state={request.status} />
                    </div>
                    <div className="meeting-facts compact">
                      <div>
                        <dt>Topic</dt>
                        <dd>{request.reason}</dd>
                      </div>
                      <div>
                        <dt>Student context</dt>
                        <dd>{request.note || "No optional note"}</dd>
                      </div>
                      <div>
                        <dt>Preferred time</dt>
                        <dd>{localTime(request.preferredAt)}</dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{localTime(request.submittedAt)}</dd>
                      </div>
                    </div>
                    {request.status === "REQUESTED" && (
                      <div className="meeting-decision-tools">
                        <label>
                          Meeting time (Asia/Karachi)
                          <input
                            type="datetime-local"
                            value={times[request.id] ?? ""}
                            onChange={(event) =>
                              setTimes((old) => ({
                                ...old,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="button-row">
                          <button
                            className="button"
                            disabled={!times[request.id] || decision.isPending}
                            onClick={() =>
                              decision.mutate({
                                id: request.id,
                                body: {
                                  action: "accept",
                                  at: toUtc(times[request.id]!),
                                },
                              })
                            }
                          >
                            Accept time
                          </button>
                          <button
                            className="button outline"
                            disabled={!times[request.id] || decision.isPending}
                            onClick={() =>
                              decision.mutate({
                                id: request.id,
                                body: {
                                  action: "propose",
                                  at: toUtc(times[request.id]!),
                                  reason: reasons[request.id] ?? "",
                                },
                              })
                            }
                          >
                            Propose another time
                          </button>
                        </div>
                        <label>
                          Required reason to decline
                          <input
                            maxLength={240}
                            value={reasons[request.id] ?? ""}
                            onChange={(event) =>
                              setReasons((old) => ({
                                ...old,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Brief, student-visible explanation"
                          />
                        </label>
                        <button
                          className="button danger outline"
                          disabled={
                            (reasons[request.id] ?? "").trim().length < 3 ||
                            decision.isPending
                          }
                          onClick={() =>
                            decision.mutate({
                              id: request.id,
                              body: {
                                action: "reject",
                                reason: reasons[request.id]!.trim(),
                              },
                            })
                          }
                        >
                          Reject request
                        </button>
                      </div>
                    )}
                    {request.status === "ACCEPTED" && (
                      <div className="meeting-decision-tools">
                        <p>
                          <strong>Accepted:</strong>{" "}
                          {localTime(request.scheduledAt)} ·{" "}
                          {request.durationMinutes} min
                        </p>
                        <label>
                          Propose a different time
                          <input
                            type="datetime-local"
                            value={times[request.id] ?? ""}
                            onChange={(event) =>
                              setTimes((old) => ({
                                ...old,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          className="button outline"
                          disabled={!times[request.id] || decision.isPending}
                          onClick={() =>
                            decision.mutate({
                              id: request.id,
                              body: {
                                action: "propose",
                                at: toUtc(times[request.id]!),
                                reason: reasons[request.id] ?? "",
                              },
                            })
                          }
                        >
                          Propose another time
                        </button>
                        <button
                          className="button"
                          disabled={decision.isPending}
                          onClick={() =>
                            decision.mutate({
                              id: request.id,
                              body: { action: "complete" },
                            })
                          }
                        >
                          Mark meeting complete
                        </button>
                      </div>
                    )}
                    {request.decisionReason && (
                      <p className="decision-reason">
                        Office response: {request.decisionReason}
                      </p>
                    )}
                  </article>
                ))}
              </section>
            ),
        )
      )}
      <ErrorBox error={decision.error} />
      <Sync error={q.error} at={q.data.syncedAt} />
    </main>
  );
}
