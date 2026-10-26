export default function Page() {
  return (
    <main className="page narrow">
      <span className="eyebrow">FICTIONAL CEDAR CAMPUS</span>
      <h1>Take QueueFair for a spin.</h1>
      <div className="panel prose">
        <p>
          This is a local, open-source demo. All seeded history is synthetic. No
          affiliation with or endorsement by a real institution is implied.
        </p>
        <h2>Three-minute walkthrough</h2>
        <ol>
          <li>
            Join Finance Desk from the student directory. Inspect the estimate
            explanation.
          </li>
          <li>
            In a separate browser context, sign in at /login as
            staff@queuefair.demo with your locally configured
            DEMO_STAFF_PASSWORD.
          </li>
          <li>
            Activate a free counter, call next, start the visit, and complete
            it. Watch the student ticket update through polling.
          </li>
          <li>
            View /display/finance-desk. Only tokens, queue counts, and counter
            states are shown.
          </li>
          <li>
            Call another ticket, wait the configured demo grace (default 10
            seconds), mark missed, then rejoin from its owning browser.
          </li>
          <li>
            Sign in as admin@queuefair.demo with DEMO_ADMIN_PASSWORD to pause a
            service and review analytics.
          </li>
        </ol>
        <h2>Demo setup & reset</h2>
        <p>
          Generate passwords of at least 12 characters in your ignored .env
          before seeding. There are no committed reusable passwords.
        </p>
        <p>
          Reset is command-only: <code>pnpm demo:reset --confirm</code>. It
          requires DEMO_MODE=true, a database name ending in _demo, and never
          runs on startup. Browser reset is unavailable.
        </p>
        <p>
          Use docs/DEMO.md for the full narration and recording instructions. No
          recorded video or Kiro usage is claimed.
        </p>
      </div>
    </main>
  );
}
