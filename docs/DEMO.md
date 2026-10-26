# Three-minute demo

All campus names and stored example history are fictional/synthetic. This is near-real-time polling, not offline ticketing. Keep a student browser and a separate incognito/profile staff browser open at the same canonical origin.

## Prepare

1. Follow README setup. Set unique demo passwords locally; read them from ignored `.env`. Staff: `staff@queuefair.demo`; administrator: `admin@queuefair.demo`.
2. For a clean repeatable demo, explicitly run `pnpm demo:reset --confirm` against your `_demo` database with `DEMO_MODE=true`. This deletes demo data and reseeds; it never runs at startup. Do not run this against any other database. Browser reset is not available.
3. Open `/services/finance-desk` as the student. Sign in at `/login` as staff in the other context. Open Finance Counter 2. Resolve the seeded called visit by Start → Complete. Resolve the serving visit at Counter 1 similarly, or leave it serving to demonstrate occupancy in the estimate.
4. To get your newly joined ticket called without waiting behind seeded tickets, process the four Finance waiting fixtures first using Call → Start → Complete. FIFO has no bypass. Alternatively create a fresh service and counter with the admin UI for a clear queue, then assign staff; no test fixture bypass controls are exposed in the product.
5. Keep the public display at `/display/finance-desk` ready. Seeded demo grace is 10 seconds, visibly labeled; normal grace is 120 seconds. The seed’s missed ticket is a synthetic owner; create a student-owned ticket to show rejoin.

## Narration and actions

| Time      | Action                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | Explain uncertainty at campus desks. Introduce QueueFair’s private ticket, explicit queue policy, and visible pauses.                                                                                   |
| 0:25–0:55 | Join Finance as a student; show token, number ahead, baseline/recent data label and expandable range explanation.                                                                                       |
| 0:55–1:25 | In the other browser, call next. Watch the student screen update within polling intervals and show the assigned counter.                                                                                |
| 1:25–1:50 | Start and complete. Show the public wall display and its token-only fields.                                                                                                                             |
| 1:50–2:15 | Join again, call, wait the 10-second demo grace, explicitly mark missed. Rejoin from the owning browser; token stays the same and queue sequence moves to the tail. A second missed turn has no rejoin. |
| 2:15–2:35 | Sign in as admin, set Finance to PAUSED with reason “Counter team briefing.” Show student/display notice, blocked joins and unavailable estimates. Restore OPEN afterward.                              |
| 2:35–3:00 | Show architecture, tests and verification record. Explain device-owned tickets, heuristic estimates, polling and fictional seed data.                                                                   |

## Fallback and recording

No fallback video has been recorded. If live setup fails, show the committed desktop/mobile screenshots and architecture, then disclose the failure; do not pretend the static screenshots are a running backend.

To record a fallback on macOS, use the built-in Screenshot toolbar (Shift-Command-5), choose Record Selected Portion, select the browser area, and run the narration above. Keep passwords, environment files, browser cookies and developer tools secret panels outside the recording. Save the recording locally, review it, and explicitly decide whether to publish it. No recording or external publication is performed by the application.

If Docker is absent, use the PostgreSQL alternative in README. If downloads fail, preserve the lockfile/source and report which install/test step was blocked. If a counter is occupied, finish or explicitly mark missed after grace; never call-next over active work. For stale pages, restore the server connection and wait for a successful refresh.
