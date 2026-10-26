"use client";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { z } from "zod";
import type { serviceSchema } from "@/lib/contracts";
import type { PublicService } from "@/server/reads";
import { api, Badge, Empty, ErrorBox, Loading, Sync, useLive } from "./shared";
import { StaffShell } from "./staff";
type Settings = z.infer<typeof serviceSchema>;
type AdminService = Settings & {
  id: string;
  counters: { id: string; name: string; state: string }[];
};
type Analytics = {
  from: string;
  to: string;
  completed: number;
  missed: number;
  rejoins: number;
  averageWaitSeconds: number | null;
  waitSamples: number;
  averageServiceSeconds: number | null;
  serviceSamples: number;
  demo: boolean;
};
const defaultSettings: Settings = {
  name: "",
  slug: "",
  description: "",
  prefix: "",
  location: "",
  state: "OPEN",
  pauseReason: null,
  notice: "",
  weeklyHours: { days: [1, 2, 3, 4, 5], open: "08:00", close: "17:00" },
  defaultServiceSeconds: 360,
  gracePeriodSeconds: 120,
  maxWaitingTickets: 100,
  documentRequirements: ["Bring relevant documents"],
  visitReasonOptions: ["General enquiry"],
};
export function AdminOverview() {
  const q = useLive<PublicService[]>("services", 5000);
  const stats = useLive<Analytics>(
    `admin/analytics?from=${new Date().toISOString().slice(0, 10)}T00:00:00%2B05:00`,
    15000,
  );
  return (
    <StaffShell admin>
      <span className="eyebrow">ADMINISTRATION · DEMO DATA</span>
      <h1>A clear view of campus.</h1>
      <p>Service operations and aggregate activity.</p>
      <ErrorBox error={stats.error} />
      <div className="stat-grid">
        <Metric
          label="Open services"
          value={q.data?.filter((s) => s.joiningOpen).length}
        />
        <Metric
          label="People waiting"
          value={q.data?.reduce((n, s) => n + s.waitingCount, 0)}
        />
        <Metric
          label="Active counters"
          value={q.data?.reduce(
            (n, s) => n + s.counters.filter((c) => c.state === "ACTIVE").length,
            0,
          )}
        />
        <Metric label="Completed today (PKT)" value={stats.data?.completed} />
      </div>
      <div className="panel">
        <h2>Service status</h2>
        {q.data?.map((s) => (
          <div className="list-row" key={s.id}>
            <Link href={`/admin/services/${s.id}`}>
              <strong>{s.name}</strong>
              <p className="muted">{s.location}</p>
            </Link>
            <Badge state={s.state} />
            <span>{s.waitingCount} waiting</span>
          </div>
        ))}
      </div>
      <Sync error={q.error} at={q.data?.[0]?.syncedAt} />
    </StaffShell>
  );
}
function Metric({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="panel stat">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
export function ManageServices({ serviceId }: { serviceId?: string }) {
  const q = useLive<AdminService[]>("admin/services", 10000);
  const [create, setCreate] = useState(false);
  return (
    <StaffShell admin>
      <span className="eyebrow">ADMINISTRATION</span>
      <div className="page-heading">
        <div>
          <h1>Services & counters</h1>
          <p>Make operational changes visible to everyone in the queue.</p>
        </div>
        <button className="button" onClick={() => setCreate((v) => !v)}>
          {create ? "Close form" : "+ Create service"}
        </button>
      </div>
      <ErrorBox error={q.error} />
      {!q.data ? (
        <Loading />
      ) : create ? (
        <ServiceForm key="new" initial={defaultSettings} />
      ) : serviceId ? (
        <>
          {q.data.find((s) => s.id === serviceId) ? (
            <ServiceEditor service={q.data.find((s) => s.id === serviceId)!} />
          ) : (
            <Empty>Service not found.</Empty>
          )}
        </>
      ) : (
        <div className="stack">
          {q.data.map((s) => (
            <Link
              className="panel service-admin-row"
              href={`/admin/services/${s.id}`}
              key={s.id}
            >
              <div>
                <h2>{s.name}</h2>
                <p>
                  {s.location} · {s.counters.length} counters
                </p>
              </div>
              <Badge state={s.state} />
              <span className="text-link">Manage →</span>
            </Link>
          ))}
        </div>
      )}
    </StaffShell>
  );
}
function ServiceEditor({ service }: { service: AdminService }) {
  const users = useLive<{ id: string; displayName: string; role: string }[]>(
    "admin/users",
    30000,
  );
  const [name, setName] = useState("");
  const [staff, setStaff] = useState("");
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      api("admin/counters", {
        serviceId: service.id,
        name,
        ...(staff ? { staffUserId: staff } : {}),
      }),
    onSuccess: () => {
      setName("");
      client.invalidateQueries();
    },
  });
  const assign = useMutation({
    mutationFn: (counterId: string) =>
      api(`admin/counters/${counterId}`, { staffUserId: staff }, "PATCH"),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <div className="stack">
      <Link href="/admin/services">← All services</Link>
      <ServiceForm key={service.id} initial={service} id={service.id} />
      <section className="panel">
        <h2>Counters & staff assignment</h2>
        <p className="muted">
          New counters start offline. Staff activate them in their workspace.
        </p>
        {service.counters.map((c) => (
          <div className="list-row" key={c.id}>
            <strong>{c.name}</strong>
            <Badge state={c.state} />
            <button
              className="button outline"
              disabled={!staff || assign.isPending}
              onClick={() => assign.mutate(c.id)}
            >
              Assign selected staff
            </button>
          </div>
        ))}
        <label>
          Assign staff
          <select value={staff} onChange={(e) => setStaff(e.target.value)}>
            <option value="">No selection</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.role})
              </option>
            ))}
          </select>
        </label>
        <ErrorBox error={assign.error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            New counter name
            <input
              value={name}
              required
              minLength={2}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ErrorBox error={create.error} />
          <button className="button" disabled={create.isPending}>
            Create counter
          </button>
        </form>
      </section>
    </div>
  );
}
function ServiceForm({ initial, id }: { initial: Settings; id?: string }) {
  const [form, setForm] = useState<Settings>(
    () =>
      Object.fromEntries(
        Object.keys(defaultSettings).map((k) => [
          k,
          initial[k as keyof Settings],
        ]),
      ) as Settings,
  );
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api(`admin/services${id ? `/${id}` : ""}`, form, id ? "PATCH" : "POST"),
    onSuccess: () => {
      setSaved(true);
      client.invalidateQueries();
    },
  });
  function field<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>{id ? `Settings · ${initial.name}` : "Create a service"}</h2>
      <div className="form-grid">
        {(["name", "slug", "prefix", "location"] as const).map((k) => (
          <label key={k}>
            {k}
            <input
              required
              value={form[k]}
              onChange={(e) => field(k, e.target.value)}
            />
          </label>
        ))}
      </div>
      <label>
        Description
        <textarea
          required
          value={form.description}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Service state
          <select
            value={form.state}
            onChange={(e) =>
              field("state", e.target.value as Settings["state"])
            }
          >
            <option>OPEN</option>
            <option>PAUSED</option>
            <option>CLOSED</option>
          </select>
        </label>
        <label>
          Visible pause / closed reason
          <input
            required={form.state !== "OPEN"}
            maxLength={160}
            value={form.pauseReason ?? ""}
            onChange={(e) => field("pauseReason", e.target.value || null)}
          />
        </label>
      </div>
      <label>
        Notice
        <input
          value={form.notice}
          maxLength={300}
          onChange={(e) => field("notice", e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Open (PKT)
          <input
            type="time"
            required
            value={form.weeklyHours.open}
            onChange={(e) =>
              field("weeklyHours", {
                ...form.weeklyHours,
                open: e.target.value,
              })
            }
          />
        </label>
        <label>
          Close (PKT)
          <input
            type="time"
            required
            value={form.weeklyHours.close}
            onChange={(e) =>
              field("weeklyHours", {
                ...form.weeklyHours,
                close: e.target.value,
              })
            }
          />
        </label>
      </div>
      <fieldset>
        <legend>Open days (PKT)</legend>
        <div className="day-options">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={form.weeklyHours.days.includes(i)}
                onChange={(e) =>
                  field("weeklyHours", {
                    ...form.weeklyHours,
                    days: e.target.checked
                      ? [...form.weeklyHours.days, i]
                      : form.weeklyHours.days.filter((d) => d !== i),
                  })
                }
              />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        {(
          [
            "defaultServiceSeconds",
            "gracePeriodSeconds",
            "maxWaitingTickets",
          ] as const
        ).map((k) => (
          <label key={k}>
            {k === "defaultServiceSeconds"
              ? "Baseline visit duration (seconds)"
              : k === "gracePeriodSeconds"
                ? "Call grace period (seconds)"
                : "Maximum waiting tickets"}
            <input
              type="number"
              required
              value={form[k]}
              onChange={(e) => field(k, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <label>
        Required documents (one per line)
        <textarea
          value={form.documentRequirements.join("\n")}
          onChange={(e) =>
            field("documentRequirements", e.target.value.split("\n"))
          }
        />
      </label>
      <label>
        Visit reasons (one per line)
        <textarea
          required
          value={form.visitReasonOptions.join("\n")}
          onChange={(e) =>
            field("visitReasonOptions", e.target.value.split("\n"))
          }
        />
      </label>
      <p className="muted">
        Timezone is fixed to Asia/Karachi. Prefix changes apply to future
        service days. Historical records cannot be deleted here.
      </p>
      <ErrorBox error={save.error} />
      {saved && (
        <p className="success" role="status">
          Settings saved.
        </p>
      )}
      <button className="button" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save service"}
      </button>
    </form>
  );
}
export function AnalyticsView() {
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() =>
    new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
  );
  const path = `admin/analytics?from=${from}T00:00:00%2B05:00&to=${to}T00:00:00%2B05:00`;
  const q = useLive<Analytics>(path, 15000);
  return (
    <StaffShell admin>
      <span className="eyebrow">AGGREGATE ANALYTICS · DEMO DATA</span>
      <h1>Understand the day.</h1>
      <p>Synthetic seeded history. No claims of real-world improvement.</p>
      <div className="panel form-grid">
        <label>
          From (inclusive, PKT)
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To (exclusive, PKT)
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <ErrorBox error={q.error} />
      {q.data ? (
        <>
          <div className="stat-grid">
            <Metric label="Completed visits" value={q.data.completed} />
            <Metric label="Missed-call events" value={q.data.missed} />
            <Metric label="Rejoin events" value={q.data.rejoins} />
            <Metric
              label="Mean waiting time"
              value={
                q.data.averageWaitSeconds === null
                  ? null
                  : `${Math.round(q.data.averageWaitSeconds / 60)} min`
              }
            />
          </div>
          <div className="panel">
            <h2>What the numbers mean</h2>
            <p>
              Waiting: call time minus queue entry for that attempt, preserved
              on each CALLED event. Sample count: {q.data.waitSamples}.
            </p>
            <p>
              Service: completion minus service start. Mean{" "}
              {q.data.averageServiceSeconds === null
                ? "unavailable"
                : `${Math.round(q.data.averageServiceSeconds / 60)} min`}
              , from {q.data.serviceSamples} visits.
            </p>
            <p>
              Missed calls and rejoins count stored events rather than current
              ticket status.
            </p>
            <p className="muted">
              Source range: {q.data.from} to {q.data.to} (exclusive).
            </p>
            {!q.data.waitSamples && !q.data.serviceSamples && (
              <Empty>No visits in this date range yet.</Empty>
            )}
          </div>
        </>
      ) : (
        !q.error && <Loading />
      )}
    </StaffShell>
  );
}
