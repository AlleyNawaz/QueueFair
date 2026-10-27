"use client";
import Link from "next/link";
import { dictionaries } from "@/lib/i18n/dictionaries";
import {
  ArrowRight,
  Clock3,
  Landmark,
  Laptop,
  MapPin,
  RefreshCw,
  Search,
  ServerOff,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "./providers";
import { Badge, ErrorBox, Loading, Sync, useLive } from "./shared";
import type { PublicService } from "@/server/reads";

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Directory() {
  const q = useLive<PublicService[]>("services", 15000);
  const [search, setSearch] = useState("");
  const { ur } = useLocale();

  if (!q.data)
    return (
      <main className="page">
        {q.isError ? (
          <section className="panel queue-load-error">
            <span className="queue-load-error-icon">
              <ServerOff size={27} />
            </span>
            <span className="eyebrow">SERVICE CONNECTION</span>
            <h1>We couldn’t load the queues.</h1>
            <p>
              Please retry shortly. If this continues, contact the service team.
            </p>
            <ErrorBox error={q.error} />
            <button
              className="button"
              disabled={q.isFetching}
              onClick={() => q.refetch()}
            >
              <RefreshCw size={16} />
              {q.isFetching ? "Retrying…" : "Try again"}
            </button>
          </section>
        ) : (
          <Loading />
        )}
      </main>
    );

  const desks = q.data.filter((service) => service.serviceType === "DESK");
  const list = desks
    .filter((s) =>
      `${s.name} ${s.description} ${s.location}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const configuredCounters = q.data.reduce(
    (total, service) => total + service.counters.length,
    0,
  );
  const waiting = q.data.reduce(
    (total, service) => total + service.waitingCount,
    0,
  );
  const atCounters = q.data.reduce(
    (total, service) =>
      total + service.counters.filter((counter) => counter.current).length,
    0,
  );
  const joiningServices = q.data.filter(
    (service) => service.joiningOpen,
  ).length;

  return (
    <main
      className="page directory-page"
      dir={ur ? "rtl" : "ltr"}
      lang={ur ? "ur" : "en"}
    >
      <div className="directory-context">
        <div className="campus-context">
          <span className="campus-monogram" aria-hidden="true">
            C
          </span>
          <span>Cedar Campus</span>
          <span className="context-divider" aria-hidden="true">
            /
          </span>
          <span>Student services</span>
        </div>
        <span className="demo-label">Fictional campus · Demo data</span>
      </div>

      <header className="directory-heading">
        <div className="directory-intro">
          <span className="eyebrow">CEDAR CAMPUS / STUDENT SERVICES</span>
          <h1>
            {ur
              ? "روانہ ہونے سے پہلے قطار جانیں۔"
              : "Know the line before you leave."}
          </h1>
          <p>
            {ur
              ? "کاؤنٹر منتخب کریں، قطار دیکھیں، اور اپنی جگہ محفوظ کریں۔"
              : "Choose a desk, see the live queue, and save your place."}
          </p>
        </div>
        <section className="campus-now" aria-label="Live campus queue summary">
          <div className="campus-now-heading">
            <span className="campus-now-label">
              <span className="pulse-mark" aria-hidden="true" />
              CAMPUS, RIGHT NOW
            </span>
            <span className={`campus-now-live ${q.error ? "stale" : ""}`}>
              {q.error ? "STALE DATA" : "LIVE QUEUES"}
            </span>
          </div>
          <div className="campus-now-stats">
            <div>
              <strong>{waiting.toString().padStart(2, "0")}</strong>
              <span>waiting</span>
            </div>
            <div>
              <strong>{atCounters.toString().padStart(2, "0")}</strong>
              <span>at counters</span>
            </div>
            <div>
              <strong>{joiningServices.toString().padStart(2, "0")}</strong>
              <span>taking joins</span>
            </div>
          </div>
          <div className="campus-now-foot">
            <span>{configuredCounters} counters configured</span>
            <Sync error={q.error} at={q.data[0]?.syncedAt} />
          </div>
        </section>
      </header>

      <section className="directory-services" aria-labelledby="services-title">
        <div className="directory-toolbar">
          <div>
            <h2 id="services-title">
              {ur ? "اپنی سروس منتخب کریں" : "Choose a service"}
              <span className="count">{desks.length}</span>
            </h2>
            <p>
              {ur
                ? "قطار کی تازہ صورتحال ہر 15 سیکنڈ میں دکھائی جاتی ہے۔"
                : "Queue state and join availability refresh every 15 seconds."}
            </p>
          </div>
          {desks.length > 0 && (
            <label className="search">
              <Search size={19} aria-hidden="true" />
              <span className="sr-only">Search campus services</span>
              <input
                aria-label="Search campus services"
                placeholder="Search services or locations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
        </div>

        {list.length > 0 ? (
          <div className="service-grid">
            {list.map((service, index) => (
              <ServiceCard
                key={service.id}
                service={service}
                index={index}
                ur={ur}
              />
            ))}
          </div>
        ) : (
          <div className="directory-empty" role="status">
            <span className="directory-empty-mark">
              <Search size={20} aria-hidden="true" />
            </span>
            <h3>
              {desks.length === 0
                ? "No campus services are configured yet"
                : "No services match that search"}
            </h3>
            <p>
              {desks.length === 0
                ? "Please check back after the campus team adds its service desks."
                : "Try a different service name or location."}
            </p>
            {desks.length > 0 && search && (
              <button className="text-link" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
          </div>
        )}

        <div className="directory-refresh">
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            Private tickets · public display shows token numbers only
          </span>
        </div>
      </section>
    </main>
  );
}

function ServiceCard({
  service,
  index,
  ur,
}: {
  service: PublicService;
  index: number;
  ur: boolean;
}) {
  const t = dictionaries[ur ? "ur" : "en"];
  const icon =
    service.prefix === "FIN"
      ? Landmark
      : service.prefix === "IT"
        ? Laptop
        : ShieldCheck;
  const hours =
    service.weeklyHours.days.length === 7
      ? "Daily"
      : service.weeklyHours.days.map((day) => weekdayNames[day]).join(" · ");
  const badgeState = service.joiningOpen
    ? "OPEN"
    : service.state === "OPEN"
      ? "CLOSED"
      : service.state;
  const closedMessage = service.pauseReason
    ? service.pauseReason
    : service.state === "OPEN"
      ? "Outside opening hours"
      : service.state === "PAUSED"
        ? "Joining is paused"
        : "This service is closed";
  const estimateQuality =
    service.estimate.samples >= 5
      ? `Recent average · ${service.estimate.samples} visits`
      : `Configured baseline · ${Math.round(service.estimate.averageSeconds / 60)} min per visit`;
  const Icon = icon;

  return (
    <article className="service-card">
      <div className="service-card-head">
        <div className="service-wayfinding">
          <span className="service-prefix">{service.prefix}</span>
          <span>
            {service.serviceType === "OFFICE" ? "OFFICE LINE" : "SERVICE DESK"}{" "}
            / {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <Badge state={badgeState} />
      </div>

      <div className="service-card-body">
        <div className="service-card-title">
          <span className="service-icon" aria-hidden="true">
            <Icon size={17} strokeWidth={1.8} />
          </span>
          <h3>{service.name}</h3>
        </div>
        <p className="service-purpose">{service.description}</p>
        <div className="service-where">
          <MapPin size={15} aria-hidden="true" />
          <span>{service.location}</span>
        </div>

        <div className="service-queue-state">
          <div className="queue-count">
            <strong>{service.waitingCount}</strong>
            <span>
              {service.waitingCount === 1 ? "person" : "people"} waiting
            </span>
          </div>
          <div className="queue-estimate">
            {service.waitingCount === 0 ? (
              <>
                <strong>No one waiting</strong>
                <span>
                  {service.joiningOpen ? "Joining is open" : closedMessage}
                </span>
              </>
            ) : service.estimate.available ? (
              <>
                <strong>{service.estimate.label}</strong>
                <span>{estimateQuality}</span>
              </>
            ) : (
              <>
                <strong>Estimate unavailable</strong>
                <span>{service.estimate.explanation}</span>
              </>
            )}
          </div>
        </div>

        {service.counters.some((counter) => counter.current) && (
          <div
            className="service-current-calls"
            aria-label="Current counter calls"
          >
            {service.counters
              .filter((counter) => counter.current)
              .slice(0, 2)
              .map((counter) => (
                <div className="service-current-call" key={counter.id}>
                  <span className="call-token">
                    {counter.current!.tokenLabel}
                  </span>
                  <span>
                    {counter.current!.status === "CALLED"
                      ? `Go to ${counter.name}`
                      : `Serving at ${counter.name}`}
                  </span>
                </div>
              ))}
          </div>
        )}

        {(service.pauseReason || service.notice) && (
          <p className="service-notice">
            {service.pauseReason || service.notice}
          </p>
        )}

        <div className="service-card-footer">
          <div className="service-card-facts">
            <span className="service-hours">
              <Clock3 size={14} aria-hidden="true" />
              {hours} · {service.weeklyHours.open}–{service.weeklyHours.close}{" "}
              PKT
            </span>
            <span className="service-counter-config">
              {service.counters.length} counters configured
            </span>
          </div>
          <Link
            className="button service-action"
            href={`/services/${service.slug}`}
            aria-label={`${t.viewQueue} for ${service.name}`}
          >
            {t.viewQueue}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
