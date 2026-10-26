"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page narrow">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please check your connection and try again. Your queue data is stored on
        the server.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
