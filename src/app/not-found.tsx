import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page narrow">
      <h1>This page has stepped out of line.</h1>
      <p>The address may be incomplete or the page may have moved.</p>
      <Link className="button" href="/">
        Return to services
      </Link>
    </main>
  );
}
