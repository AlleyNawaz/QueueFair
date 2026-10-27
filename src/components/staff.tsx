"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Monitor,
  Settings2,
  Users,
} from "lucide-react";
import type { StaffOverview } from "@/server/reads";
import { api, Badge, Empty, ErrorBox, Loading, Sync, useLive } from "./shared";
import { ReferenceDisclaimer } from "./office-meetings";
export function Login() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<{ role: string }>("auth/login", { email, password }),
    onSuccess: (d) => {
      queryClient.clear();
      router.push(d.role === "ADMIN" ? "/admin" : "/staff");
      router.refresh();
    },
  });
  return (
    <main className="page login-page">
      <section className="login-intro">
        <span className="eyebrow">THE OTHER SIDE OF THE COUNTER</span>
        <h1>A calmer queue starts here.</h1>
        <p>One clear next step. A fair place for everyone.</p>
        <div className="policy">
          <Users size={26} />
          <p>
            Staff access is limited to assigned services and counters. Every
            queue action is recorded.
          </p>
        </div>
      </section>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <span className="eyebrow">STAFF & ADMINISTRATORS</span>
        <h2>Welcome back</h2>
        <p>Sign in to your campus workspace.</p>
        <label>
          Email address
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ErrorBox error={mutation.error} />
        <button className="button full" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in"}
          <ArrowRight size={17} />
        </button>
        <small>
          Demo credentials are configured locally through environment variables.{" "}
          <Link href="/demo">View setup guide</Link>.
        </small>
      </form>
    </main>
  );
}
export function StaffShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api("auth/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
      router.refresh();
    },
  });
  return (
    <div className="workspace">
      <aside className="workspace-nav">
        <span className="eyebrow">
          {admin ? "ADMINISTRATION" : "STAFF WORKSPACE"}
        </span>
        <Link href={admin ? "/admin" : "/staff"}>
          <LayoutDashboard size={18} /> Overview
        </Link>
        {admin && (
          <>
            <Link href="/admin/services">
              <Settings2 size={18} /> Services & counters
            </Link>
            <Link href="/admin/analytics">
              <Activity size={18} /> Analytics
            </Link>
          </>
        )}
        <Link href="/staff">
          <Monitor size={18} /> Counter workspace
        </Link>
        <Link href="/staff/meetings">
          <CalendarClock size={18} /> Meeting inbox
        </Link>
        <Link href="/">
          <ArrowLeft size={18} /> Student services
        </Link>
        <button onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut size={18} /> Sign out
        </button>
        <ErrorBox error={logout.error} />
        <div className="workspace-note">
          Fair by design.
          <br />
          No hidden priority. No manual reordering.
        </div>
      </aside>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
export function Staff({ counterId }: { counterId?: string }) {
  const q = useLive<StaffOverview>("staff/overview", 2000);
  const client = useQueryClient();
  const [pauseReason, setPauseReason] = useState("");
  const [pause, setPause] = useState(false);
  const mutation = useMutation({
    mutationFn: ({
      id,
      action,
      ticketId,
    }: {
      id: string;
      action: string;
      ticketId?: string;
    }) =>
      api(
        `counters/${id}/${ticketId ? `tickets/${ticketId}/` : ""}${action}`,
        action === "pause" ? { reason: pauseReason } : {},
      ),
    onSuccess: () => {
      setPause(false);
      client.invalidateQueries();
    },
  });
  if (!q.data)
    return (
      <StaffShell>
        <ErrorBox error={q.error} />
        {q.error ? (
          <Link className="button" href="/login">
            Sign in
          </Link>
        ) : (
          <Loading />
        )}
      </StaffShell>
    );
  const d = q.data;
  const service = d.services.find((s) =>
    s.counters.some((c) => c.id === counterId),
  );
  const counter = service?.counters.find((c) => c.id === counterId);
  return (
    <StaffShell>
      <span className="eyebrow">CEDAR CAMPUS · DEMO WORKSPACE</span>
      {!counterId ? (
        <>
          <div className="page-heading">
            <div>
              <h1>Hello, {d.user.displayName.split(" ")[0]}.</h1>
              <p>Your counters, and a clear picture of the day.</p>
            </div>
            <Badge state={d.user.role} />
          </div>
          {d.services.some((item) =>
            item.officeSourceUrl?.includes("nust.edu.pk"),
          ) && (
            <ReferenceDisclaimer text="Independent QueueFair prototype. NUST’s public directory is used only as a routing reference; this is not an official NUST service and does not confirm officer availability." />
          )}
          <div className="stack">
            {d.services.map((s) => (
              <section key={s.id} className="panel">
                <div className="section-heading">
                  <div>
                    <h2>{s.name}</h2>
                    <p>
                      {s.waitingCount} waiting · {s.location}
                    </p>
                  </div>
                  <Badge state={s.state} />
                </div>
                {s.pauseReason && <p className="notice">{s.pauseReason}</p>}
                {s.serviceType === "OFFICE" && (
                  <OfficeAvailability service={s} />
                )}
                <div className="counter-grid">
                  {s.counters.map((c) => (
                    <Link
                      className="counter-choice"
                      key={c.id}
                      href={`/staff/counters/${c.id}`}
                    >
                      <div>
                        <Monitor size={22} />
                        <h3>{c.name}</h3>
                        <Badge state={c.state} />
                      </div>
                      <p>
                        {c.work
                          ? `${c.work.tokenLabel} · ${c.work.status.toLowerCase()}`
                          : "No active ticket"}
                      </p>
                      <span className="text-link">
                        Open workspace <ArrowRight size={16} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
            {!d.services.length && (
              <Empty>
                No counters are assigned to this account. Ask an administrator
                to assign one.
              </Empty>
            )}
          </div>
        </>
      ) : !counter || !service ? (
        <>
          <h1>Counter unavailable</h1>
          <p>This counter is missing or not assigned to you.</p>
        </>
      ) : (
        <>
          <Link className="back-link" href="/staff">
            <ArrowLeft size={16} /> All assigned counters
          </Link>
          {service.officeSourceUrl?.includes("nust.edu.pk") && (
            <ReferenceDisclaimer text="Independent QueueFair prototype. NUST’s public directory is used only as a routing reference; this is not an official NUST service and does not confirm officer availability." />
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">{service.name}</span>
              <h1>{counter.name}</h1>
              <p>
                {service.location} · {service.gracePeriodSeconds}s call grace
              </p>
            </div>
            <Badge state={counter.state} />
          </div>
          {service.pauseReason && (
            <div className="notice">
              {service.state}: {service.pauseReason}. Existing called or serving
              visits can finish.
            </div>
          )}
          {service.serviceType === "OFFICE" && (
            <OfficeAvailability service={service} />
          )}
          <ErrorBox error={mutation.error} />
          <div className="operator-layout">
            <section className="stack">
              <div className="panel current-work">
                <span className="eyebrow">CURRENT VISIT</span>
                {counter.work ? (
                  <>
                    <div className="token" dir="ltr">
                      {counter.work.tokenLabel}
                    </div>
                    <Badge state={counter.work.status} />
                    {(counter.work.visitReasonCode || counter.work.note) && (
                      <div className="office-private-details">
                        {counter.work.visitReasonCode && (
                          <p>Visit reason: {counter.work.visitReasonCode}</p>
                        )}
                        {counter.work.note && (
                          <p>Student note: {counter.work.note}</p>
                        )}
                      </div>
                    )}
                    <p>
                      Elapsed{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (+new Date(d.syncedAt) -
                            +new Date(
                              counter.work.serviceStartedAt ??
                                counter.work.calledAt ??
                                +new Date(d.syncedAt),
                            )) /
                            1000,
                        ),
                      )}{" "}
                      seconds
                    </p>
                    <div className="actions">
                      {counter.work.status === "CALLED" ? (
                        <>
                          <button
                            className="button"
                            disabled={mutation.isPending || !!q.error}
                            onClick={() =>
                              mutation.mutate({
                                id: counter.id,
                                action: "start",
                                ticketId: counter.work!.id,
                              })
                            }
                          >
                            Start service
                          </button>
                          <button
                            className="button danger-outline"
                            disabled={
                              mutation.isPending ||
                              !!q.error ||
                              +new Date(d.syncedAt) -
                                +new Date(counter.work.calledAt!) <
                                service.gracePeriodSeconds * 1000
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Mark this ticket as missed? The student may rejoin once if eligible.",
                                )
                              )
                                mutation.mutate({
                                  id: counter.id,
                                  action: "miss",
                                  ticketId: counter.work!.id,
                                });
                            }}
                          >
                            Mark missed
                          </button>
                        </>
                      ) : (
                        <button
                          className="button"
                          disabled={mutation.isPending || !!q.error}
                          onClick={() =>
                            mutation.mutate({
                              id: counter.id,
                              action: "complete",
                              ticketId: counter.work!.id,
                            })
                          }
                        >
                          Complete service
                        </button>
                      )}
                    </div>
                    {counter.work.status === "CALLED" && (
                      <small>
                        Staff explicitly marks missed after the grace period.
                        There is no automatic removal.
                      </small>
                    )}
                  </>
                ) : (
                  <>
                    <Monitor size={38} />
                    <h2>Ready for the next visit?</h2>
                    <p>
                      {service.waitingCount} people are waiting. Tickets are
                      called in arrival order.
                    </p>
                    <button
                      className="button"
                      disabled={
                        mutation.isPending ||
                        !!q.error ||
                        counter.state !== "ACTIVE" ||
                        !service.joiningOpen ||
                        !service.waitingCount
                      }
                      onClick={() =>
                        mutation.mutate({ id: counter.id, action: "call-next" })
                      }
                    >
                      Call next ticket <ArrowRight size={18} />
                    </button>
                  </>
                )}
              </div>
              <div className="panel">
                <h2>Counter controls</h2>
                {counter.pauseReason && (
                  <p className="notice">{counter.pauseReason}</p>
                )}
                <div className="actions">
                  {counter.state === "OFFLINE" ? (
                    <button
                      className="button"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ id: counter.id, action: "activate" })
                      }
                    >
                      Activate counter
                    </button>
                  ) : counter.state === "PAUSED" ? (
                    <button
                      className="button"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ id: counter.id, action: "resume" })
                      }
                    >
                      Resume counter
                    </button>
                  ) : (
                    <button
                      className="button outline"
                      onClick={() => setPause((v) => !v)}
                    >
                      Pause counter
                    </button>
                  )}
                  {counter.state !== "OFFLINE" && (
                    <button
                      className="button danger-outline"
                      disabled={mutation.isPending || !!counter.work}
                      onClick={() =>
                        mutation.mutate({ id: counter.id, action: "close" })
                      }
                    >
                      Close counter
                    </button>
                  )}
                </div>
                {pause && (
                  <form
                    className="pause-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutation.mutate({ id: counter.id, action: "pause" });
                    }}
                  >
                    <label>
                      Visible reason
                      <input
                        required
                        minLength={3}
                        maxLength={160}
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                      />
                    </label>
                    <button className="button" disabled={mutation.isPending}>
                      Confirm pause
                    </button>
                  </form>
                )}
              </div>
              <div className="panel">
                <h2>Other counters</h2>
                {service.counters.map((c) => (
                  <div className="list-row" key={c.id}>
                    <span>{c.name}</span>
                    <Badge state={c.state} />
                    <span>{c.current?.tokenLabel ?? "—"}</span>
                  </div>
                ))}
              </div>
            </section>
            <aside className="panel">
              <div className="section-heading">
                <h2>Waiting queue</h2>
                <span className="count">{service.waitingCount}</span>
              </div>
              <p className="muted">FIFO · earliest arrival first</p>
              {service.waiting.length ? (
                <ol className="waiting-list">
                  {service.waiting.map((t, i) => (
                    <li key={t.id}>
                      <span className="queue-number">{i + 1}</span>
                      <div>
                        <strong>{t.tokenLabel}</strong>
                        <small>
                          {Math.max(
                            0,
                            Math.floor(
                              (+new Date(d.syncedAt) -
                                +new Date(t.queueEnteredAt)) /
                                60000,
                            ),
                          )}{" "}
                          min waiting {t.rejoinCount > 0 ? "· Rejoined" : ""}
                        </small>
                        {(t.visitReasonCode || t.note) && (
                          <small className="office-private-details">
                            {t.visitReasonCode}
                            {t.note ? ` · ${t.note}` : ""}
                          </small>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>The queue is clear.</Empty>
              )}
            </aside>
          </div>
        </>
      )}
      <Sync error={q.error} at={d.syncedAt} />
    </StaffShell>
  );
}

function OfficeAvailability({
  service,
}: {
  service: StaffOverview["services"][number];
}) {
  const client = useQueryClient();
  const [reason, setReason] = useState(
    service.pauseReason || "In a meeting; existing queue order is preserved.",
  );
  const action =
    service.state === "PAUSED"
      ? "resume"
      : service.state === "OPEN"
        ? "pause"
        : null;
  const mutation = useMutation({
    mutationFn: () =>
      api(
        `staff/services/${service.id}/${action}`,
        action === "pause" ? { reason } : {},
      ),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <div className="office-availability">
      <div>
        <strong>
          {service.state === "PAUSED"
            ? "Office line paused"
            : "Office line accepting walk-ins"}
        </strong>
        <p>
          {service.waitingCount} waiting · the FIFO order is preserved when the
          line pauses.
        </p>
      </div>
      {action === "pause" && (
        <label>
          Public-safe meeting notice
          <input
            maxLength={160}
            minLength={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {action ? (
        <>
          <ErrorBox error={mutation.error} />
          <button
            className={action === "pause" ? "button outline" : "button"}
            disabled={
              mutation.isPending ||
              (action === "pause" && reason.trim().length < 3)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Updating office line…"
              : action === "pause"
                ? "In a meeting — pause new joins and calls"
                : "Resume office walk-in line"}
          </button>
        </>
      ) : (
        <p>Closed by an administrator. Ask them to reopen walk-ins.</p>
      )}
    </div>
  );
}
