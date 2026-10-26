import Link from "next/link";
export default function Unauthorized() {
  return (
    <main className="page narrow">
      <h1>This workspace needs a different role.</h1>
      <p>
        Your account does not have access to this area. Staff can operate their
        assigned counters; service settings and analytics require an
        administrator.
      </p>
      <div className="actions">
        <Link className="button" href="/staff">
          Open my counters
        </Link>
        <Link className="button outline" href="/login">
          Use another account
        </Link>
      </div>
    </main>
  );
}
