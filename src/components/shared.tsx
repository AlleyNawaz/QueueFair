"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Clock3,
  Layers3,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Ticket as TicketIcon,
} from "lucide-react";
import { useLocale } from "./providers";
import type { Estimate } from "@/lib/policy";
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
  key?: string,
): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key ?? crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        },
  );
  const json = await response.json();
  if (!response.ok) {
    const fields = json.error?.fields;
    throw new Error(
      json.error?.message +
        (fields
          ? " " +
            Object.entries(fields)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join(" ")
          : ""),
    );
  }
  return json.data;
}
export function useLive<T>(path: string, interval: number) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path),
    refetchInterval: interval,
  });
}
export function Header() {
  const { ur, toggle, t } = useLocale();
  const pathname = usePathname();
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <Layers3 size={24} />
        </span>
        QueueFair
        <span className="brand-dot" aria-hidden="true">
          .
        </span>
      </Link>
      <nav aria-label="Main navigation">
        <Link
          href="/"
          aria-current={
            pathname === "/" || pathname.startsWith("/services/")
              ? "page"
              : undefined
          }
        >
          {t.services}
        </Link>
        <Link
          href="/offices"
          aria-current={
            pathname === "/offices" || pathname.startsWith("/offices/")
              ? "page"
              : undefined
          }
        >
          Meet an officer
        </Link>
        <Link
          href="/my-tickets"
          aria-current={
            pathname === "/my-tickets" || pathname.startsWith("/tickets/")
              ? "page"
              : undefined
          }
        >
          <TicketIcon size={17} />
          <span>{t.myTickets}</span>
        </Link>
        <Link
          className="desktop-only"
          href="/how-it-works"
          aria-current={pathname === "/how-it-works" ? "page" : undefined}
        >
          How it works
        </Link>
      </nav>
      <div className="header-end">
        <button className="language" onClick={toggle} lang={ur ? "en" : "ur"}>
          {ur ? "English" : "اردو"}
        </button>
        <Link className="staff-link" href="/staff">
          Staff portal <ArrowUpRight size={15} />
        </Link>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <span>
        <ShieldCheck size={16} /> A little more clarity. A lot less waiting.
      </span>
      <span>
        Fictional campus demo · <Link href="/demo">Demo guide</Link>
      </span>
    </footer>
  );
}
export function Badge({ state }: { state: string }) {
  return (
    <span className={`badge ${state.toLowerCase()}`}>
      <span aria-hidden="true" className="status-dot" />
      {state.replaceAll("_", " ")}
    </span>
  );
}
export function Sync({ error, at }: { error: unknown; at?: string }) {
  return (
    <div className={`sync ${error ? "stale" : ""}`} role="status">
      <RefreshCw size={13} />
      {error
        ? "Connection interrupted · showing stale data. Retrying…"
        : `Updated ${at ? new Date(at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "just now"} · near-real-time polling`}
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <RefreshCw size={22} /> Loading the latest queue…
    </div>
  );
}
export function Location({ location }: { location: string }) {
  return (
    <span className="muted inline">
      <MapPin size={15} />
      {location}
    </span>
  );
}
export function EstimatePanel({ estimate: e }: { estimate: Estimate }) {
  return (
    <details className="estimate-details">
      <summary>
        <CircleHelp size={16} /> How is this estimated?
      </summary>
      <p>{e.explanation}</p>
      <dl className="facts">
        <div>
          <dt>People ahead</dt>
          <dd>{e.ahead}</dd>
        </div>
        <div>
          <dt>Counters set active</dt>
          <dd>{e.activeCounters}</dd>
        </div>
        <div>
          <dt>{e.source}</dt>
          <dd>{Math.round(e.averageSeconds / 60)} min / visit</dd>
        </div>
        <div>
          <dt>Valid recent samples</dt>
          <dd>{e.samples}</dd>
        </div>
      </dl>
      <small>
        Active is a configured counter state; it does not confirm an operator is
        present. Outlier rule: only 30 seconds–2 hours, up to 30 visits. Fewer
        than five samples uses the configured baseline. The range is heuristic,
        not a confidence interval.
      </small>
    </details>
  );
}
export function Policy() {
  const { t } = useLocale();
  return (
    <div className="policy">
      <Clock3 size={20} />
      <div>
        <strong>{t.missedTitle}</strong>
        <p>{t.missedPolicy}</p>
      </div>
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Check size={28} />
      <p>{children}</p>
    </div>
  );
}
