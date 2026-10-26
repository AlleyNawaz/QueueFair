"use client";
import Link from "next/link";
import { dictionaries } from "@/lib/i18n/dictionaries";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Landmark,
  Laptop,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "./providers";
import { Badge, ErrorBox, Loading, Location, Sync, useLive } from "./shared";
import type { PublicService } from "@/server/reads";
export function Directory() {
  const q = useLive<PublicService[]>("services", 15000);
  const [search, setSearch] = useState("");
  const { ur, t } = useLocale();
  if (!q.data)
    return (
      <>
        <ErrorBox error={q.error} />
        <Loading />
      </>
    );
  const list = q.data.filter((s) =>
    `${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="page" dir={ur ? "rtl" : "ltr"}>
      <div className="eyebrow">
        <span className="status-dot" /> CEDAR CAMPUS{" "}
        <span className="divider">/</span> STUDENT SERVICES
      </div>
      <div className="page-heading">
        <div>
          <h1>{t.headline}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="campus-date">
          <Clock3 size={18} />
          <div>
            Campus time{" "}
            <strong>
              {new Date(
                q.data[0]?.syncedAt ?? "2026-01-01T00:00:00Z",
              ).toLocaleString("en-PK", {
                timeZone: "Asia/Karachi",
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
            <small>Asia/Karachi</small>
          </div>
        </div>
      </div>
      <div className="intro-strip">
        <div className="intro-icon">
          <TicketSymbol />
        </div>
        <div>
          <strong>A place in line. Peace of mind.</strong>
          <p>
            Join from your browser. Follow your ticket. Head to the counter when
            called.
          </p>
        </div>
        <Link href="/how-it-works">
          See how it works <ArrowRight size={16} />
        </Link>
      </div>
      <div className="directory-layout">
        <section>
          <div className="section-heading">
            <div>
              <h2>
                {t.campusServices}{" "}
                <span className="count">{q.data.length}</span>
              </h2>
              <p>Choose the desk you need today.</p>
            </div>
            <label className="search">
              <Search size={17} />
              <span className="sr-only">Search services</span>
              <input
                placeholder="Search services"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="service-grid">
            {list.map((s) => (
              <ServiceCard key={s.id} s={s} ur={ur} />
            ))}
          </div>
          {!list.length && (
            <p className="empty">No services match your search.</p>
          )}
          <Sync error={q.error} at={q.data[0]?.syncedAt} />
        </section>
        <aside className="directory-aside">
          <div className="aside-card">
            <span className="eyebrow">A FAIRER WAY TO WAIT</span>
            <h3>
              Your place is
              <br />
              always clear.
            </h3>
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <strong>Choose a service</strong>
                  <p>Check the queue and what to bring.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Get your private ticket</strong>
                  <p>No name or student ID needed.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Watch for your turn</strong>
                  <p>Your ticket updates automatically.</p>
                </div>
              </li>
            </ol>
            <Link href="/my-tickets" className="text-link">
              Already in line? Find your ticket <ArrowRight size={16} />
            </Link>
          </div>
          <div className="note-card">
            <BookOpen size={21} />
            <strong>A note about this campus</strong>
            <p>
              Cedar Campus is fictional. This is an open-source demo with
              synthetic queue history.
            </p>
            <Link href="/demo">
              Explore the demo <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
      <div className="bottom-note">
        <Users size={18} />
        <span>
          One place per service, per browser. Everyone follows the same queue.
        </span>
        <Link href="/how-it-works">
          Our fair queue policy <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
function TicketSymbol() {
  return <GraduationCap size={25} />;
}
function ServiceCard({ s, ur }: { s: PublicService; ur: boolean }) {
  const Icon =
    s.prefix === "FIN" ? Landmark : s.prefix === "IT" ? Laptop : GraduationCap;
  return (
    <article className="service-card">
      <div className="card-top">
        <span className={`service-icon ${s.prefix.toLowerCase()}`}>
          <Icon size={24} />
        </span>
        <Badge
          state={
            s.joiningOpen ? "OPEN" : s.state === "OPEN" ? "CLOSED" : s.state
          }
        />
      </div>
      <h3>{s.name}</h3>
      <p className="service-description">{s.description}</p>
      <Location location={s.location} />
      <div className="card-metrics">
        <div>
          <span>
            <Users size={14} /> Waiting
          </span>
          <strong>
            {s.waitingCount}
            <small> people</small>
          </strong>
        </div>
        <div>
          <span>
            <Clock3 size={14} /> Approx. wait
          </span>
          <strong className="wait-value">
            {s.estimate.available
              ? s.estimate.seconds! < 60
                ? "Up next"
                : s.estimate.label
              : "Unavailable"}
          </strong>
        </div>
      </div>
      {s.pauseReason && <p className="notice">{s.pauseReason}</p>}
      <div className="card-hours">
        <span className="status-dot" />
        {s.weeklyHours.open}–{s.weeklyHours.close} · PKT
      </div>
      <Link className="button outline full" href={`/services/${s.slug}`}>
        {dictionaries[ur ? "ur" : "en"].viewQueue}
        <ArrowRight size={17} />
      </Link>
    </article>
  );
}
