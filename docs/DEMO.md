# Three-minute demo

All campus names and stored example history are fictional/synthetic. This is near-real-time polling, not offline ticketing. Keep a student browser and a separate incognito/profile staff browser open at the same canonical origin.

The seed now includes three fictional campus desks and two fictional same-day office walk-in queues. Login passwords come from ignored `.env` variables and are not committed or printed by the seed.

- `hostel.officer@queuefair.demo` uses `DEMO_HOSTEL_OFFICER_PASSWORD` and is assigned only to Cedar Hostel Office.
- `sports.officer@queuefair.demo` uses `DEMO_SPORTS_OFFICER_PASSWORD` and is assigned only to Campus Activities Office.

Cedar Hostel Office starts paused with the public notice “In a meeting; existing queue order is preserved.” Resume it as the assigned officer to accept walk-ins. Its 30-second demo arrival window is intentionally short; use a service-specific grace such as 300 seconds for normal office operation. This is a FIFO walk-in queue, not a scheduled meeting or promised time.

## Prepare

1. Follow README setup. Set unique demo passwords locally; read them from ignored `.env`. Staff: `staff@queuefair.demo`; administrator: `admin@queuefair.demo`.
2. For a clean repeatable demo, explicitly run `pnpm demo:reset --confirm` against your `_demo` database with `DEMO_MODE=true`. This deletes demo data and reseeds; it never runs at startup. Do not run this against any other database. Browser reset is not available.
3. Open `/services/finance-desk` in the student browser and join. The Finance seed intentionally has no active work or waiting tickets, so this student becomes the first ticket and can be called immediately under FIFO.
4. In a separate browser profile, sign in at `/login` and open the assigned Finance Counter 1 workspace. Call the ticket, then show the student’s live update. Start and complete the visit; the call and completion update the same persisted ticket.
5. Keep `/display/finance-desk` ready in a third tab. Other services contain the seeded waiting, called and serving examples. Seeded demo grace is 10 seconds, visibly labeled; normal grace is 120 seconds. To show missed/rejoin, create a second student-owned Finance ticket, call it, wait the short grace, explicitly mark it missed, and rejoin from that same student browser.
6. For the office story, open `/services/cedar-hostel-office` as a student and `/login` in a separate profile as `hostel.officer@queuefair.demo`. The office starts paused with one synthetic waiting ticket. Resume the same-day walk-in line; the existing ticket remains first. Have the student join with a broad reason and optional non-sensitive note, open the officer workspace, call the next eligible ticket, then start and complete it. The private ticket tells the student when to go and shows the configured short arrival window. The public office display shows token/counter state only. This is not appointment scheduling or a guaranteed meeting time.

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

The local fixture set is deliberately small: Finance has five completed samples and one inaccessible synthetic missed ticket, but starts with an empty active queue for the live student flow. Student Affairs and IT contain synthetic active work, missed tickets, and waiting tickets so the directory and wall displays have realistic states. All are synthetic, not attendance or impact data.

Counters labeled **set active** reflect their saved configuration state only. They do not indicate an operator is signed in or physically present. No AWS integration is used or claimed.

## Fallback and recording

No fallback video has been recorded. If live setup fails, show the committed desktop/mobile screenshots and architecture, then disclose the failure; do not pretend the static screenshots are a running backend.

To record a fallback on macOS, use the built-in Screenshot toolbar (Shift-Command-5), choose Record Selected Portion, select the browser area, and run the narration above. Keep passwords, environment files, browser cookies and developer tools secret panels outside the recording. Save the recording locally, review it, and explicitly decide whether to publish it. No recording or external publication is performed by the application.

If Docker is absent, use the PostgreSQL alternative in README. If downloads fail, preserve the lockfile/source and report which install/test step was blocked. If a counter is occupied, finish or explicitly mark missed after grace; never call-next over active work. For stale pages, restore the server connection and wait for a successful refresh.
