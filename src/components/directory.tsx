"use client";
import Link from "next/link";
import { dictionaries } from "@/lib/i18n/dictionaries";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  GraduationCap,
  RefreshCw,
  ServerOff,
  Landmark,
  Laptop,
  MapPin,
  Radio,
  Search,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "./providers";
import { Badge, ErrorBox, Loading, Sync, useLive } from "./shared";
import type { PublicService } from "@/server/reads";

export function Directory() {
  const q = useLive<PublicService[]>("services", 15000);
  const [search, setSearch] = useState("");
  const { ur, t } = useLocale();
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
  const list = q.data.filter((s) =>
    `${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const active = q.data.reduce(
    (n, s) => n + s.counters.filter((c) => c.state === "ACTIVE").length,
    0,
  );
  const waiting = q.data.reduce((n, s) => n + s.waitingCount, 0);
  return (
    <main
      className="page directory-page"
      dir={ur ? "rtl" : "ltr"}
      lang={ur ? "ur" : "en"}
    >
      <div className="directory-context">
        <span>
          <span className="campus-monogram">C</span>Cedar Campus{" "}
          <span className="context-divider">/</span> Student services
        </span>
        <span className="demo-label">Fictional campus · Demo data</span>
      </div>
      <section className="directory-hero" aria-label="Campus queue overview">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" /> A BETTER WAY TO WAIT
          </span>
          <h1>
            {ur ? (
              t.headline
            ) : (
              <>
                Your time.
                <br />
                <span>Back in your hands.</span>
              </>
            )}
          </h1>
          <p>{t.intro}</p>
          <div className="hero-footnote">
            <ShieldCheck size={16} />
            <span>No account. No personal details. Just your turn.</span>
          </div>
        </div>
        <div className="campus-pulse">
          <div className="pulse-heading">
            <span>
              <Radio size={16} /> Campus pulse
            </span>
            <span className={`pulse-live ${q.error ? "is-stale" : ""}`}>
              <span className="status-dot" />
              {q.error ? "STALE" : "LIVE"}
            </span>
          </div>
          <div className="pulse-main">
            <div>
              <strong>{String(waiting).padStart(2, "0")}</strong>
              <span>people in line across campus</span>
            </div>
            <div className="pulse-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
              <Ticket size={24} />
            </div>
          </div>
          <div className="pulse-footer">
            <span>
              <i />
              {active} active counters
            </span>
            <span>
              {q.data.filter((s) => s.joiningOpen).length} services open{" "}
              <ArrowUpRight size={14} />
            </span>
          </div>
        </div>
      </section>
      <section className="directory-services" aria-labelledby="services-title">
        <div className="directory-toolbar">
          <div>
            <h2 id="services-title">
              {t.campusServices}
              <span className="count">{q.data.length}</span>
            </h2>
            <p>A clear queue. A little more room in your day.</p>
          </div>
          <label className="search">
            <Search size={19} />
            <span className="sr-only">Search services</span>
            <input
              placeholder="Find your service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd aria-hidden="true">⌕</kbd>
          </label>
        </div>
        <div className="service-grid">
          {list.map((s, i) => (
            <ServiceCard key={s.id} s={s} ur={ur} index={i} />
          ))}
        </div>
        {!list.length && (
          <div className="empty">
            <Search size={26} />
            <p>
              {q.data.length === 0
                ? "Campus services are being set up. Please check back shortly."
                : "No services match your search."}
            </p>
          </div>
        )}
        <div className="directory-refresh">
          <Sync error={q.error} at={q.data[0]?.syncedAt} />
          <span>
            <ShieldCheck size={14} /> Fair queue. Same rules for everyone.
          </span>
        </div>
      </section>
      <section className="how-strip" aria-label="How QueueFair works">
        <div className="how-strip-heading">
          <span className="eyebrow">FROM HERE TO YOUR TURN</span>
          <h2>
            Three steps.
            <br /> Zero guesswork.
          </h2>
          <Link className="text-link" href="/how-it-works">
            How it works <ArrowUpRight size={15} />
          </Link>
        </div>
        <ol>
          <li>
            <span className="step-icon">
              <Search size={21} />
            </span>
            <span className="step-number">01</span>
            <h3>Find your desk</h3>
            <p>Check the wait and what to bring.</p>
          </li>
          <li>
            <span className="step-icon">
              <Ticket size={21} />
            </span>
            <span className="step-number">02</span>
            <h3>Save your place</h3>
            <p>Get a private ticket in this browser.</p>
          </li>
          <li>
            <span className="step-icon">
              <Check size={21} />
            </span>
            <span className="step-number">03</span>
            <h3>Make your move</h3>
            <p>Head over when your counter calls.</p>
          </li>
        </ol>
      </section>
      <div className="browser-reminder">
        <div>
          <ShieldCheck size={20} />
          <p>
            <strong>Your ticket stays with this browser.</strong> Keep your
            cookies to keep self-service access.
          </p>
        </div>
        <Link href="/my-tickets">
          Find my tickets <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  );
}
function ServiceCard({
  s,
  ur,
  index,
}: {
  s: PublicService;
  ur: boolean;
  index: number;
}) {
  const Icon =
    s.prefix === "FIN" ? Landmark : s.prefix === "IT" ? Laptop : GraduationCap;
  const tone =
    s.prefix === "FIN"
      ? "finance"
      : s.prefix === "IT"
        ? "technology"
        : "student";
  return (
    <article className={`service-card service-${tone}`}>
      <div className="service-card-art">
        <div className="art-grid" aria-hidden="true" />
        <span className="service-index">
          CAMPUS / {String(index + 1).padStart(2, "0")}
        </span>
        <span className="service-glyph" aria-hidden="true">
          <Icon strokeWidth={1.35} />
        </span>
        <span className="art-prefix" aria-hidden="true">
          {s.prefix}
        </span>
        <Badge
          state={
            s.joiningOpen ? "OPEN" : s.state === "OPEN" ? "CLOSED" : s.state
          }
        />
      </div>
      <div className="service-card-content">
        <div className="service-title-row">
          <h3>{s.name}</h3>
          <ArrowUpRight size={18} aria-hidden="true" />
        </div>
        <p className="service-description">{s.description}</p>
        <div className="service-location">
          <MapPin size={14} />
          {s.location}
        </div>
        <div className="card-metrics">
          <div>
            <span>
              <Clock3 size={14} /> Estimated wait
            </span>
            <strong className="wait-value">
              {s.estimate.available
                ? s.estimate.seconds! < 60
                  ? "Up next"
                  : s.estimate.label
                : "Unavailable"}
            </strong>
          </div>
          <div>
            <span>
              <Users size={14} /> In line
            </span>
            <strong>
              {String(s.waitingCount).padStart(2, "0")}
              <small> people</small>
            </strong>
          </div>
        </div>
        {s.pauseReason && <p className="notice">{s.pauseReason}</p>}
        <div className="service-card-bottom">
          <span className="card-hours">
            {s.weeklyHours.open}–{s.weeklyHours.close} <small>PKT</small>
          </span>
          <Link className="button card-action" href={`/services/${s.slug}`}>
            {dictionaries[ur ? "ur" : "en"].viewQueue}
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
