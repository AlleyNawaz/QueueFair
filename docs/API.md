# HTTP API

Node runtime route handler: `src/app/api/[...path]/route.ts`. All successful responses are `{ "data": ... }`; failures are `{ "error": { "code": "...", "message": "safe text", "fields": { "name": ["validation error"] } } }` (fields only when relevant). Queue reads are no-store. Dates are ISO UTC except server-derived `localDate` strings.

Every mutation validates `Origin`. When `APP_ORIGIN` is set, the origin must match it; otherwise the request must be same-origin with its URL. Browser fetch sends this automatically. Cookies are HttpOnly, SameSite=Lax, Secure in production. Do not send cookie secrets in URLs. No state changes occur through GET.

## Public and owner

| Method | Path                             | Authority / payload                                                                     |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/services`                  | Public directory DTO array                                                              |
| GET    | `/api/services/:id/public-state` | Public service, counters’ tokens, next five, counts, estimate                           |
| POST   | `/api/auth/anonymous`            | Establish random owner cookie first; `{}`                                               |
| POST   | `/api/services/:id/tickets`      | Owner cookie, Idempotency-Key; `{ "reason":"Fee enquiry", "note":"optional, max 240" }` |
| GET    | `/api/me/tickets`                | Browser-owned ticket DTO array (empty without ownership)                                |
| GET    | `/api/tickets/:publicId`         | Owning capability cookie; another browser gets 404                                      |
| POST   | `/api/tickets/:publicId/cancel`  | Owner; `{}`; WAITING/CALLED/MISSED                                                      |
| POST   | `/api/tickets/:publicId/rejoin`  | Owner, Idempotency-Key; `{}`; one same-day rejoin while open                            |

Example: preserve cookies with a local cookie jar, first establish ownership, then issue a ticket. Obtain service ID from the directory endpoint. Do not commit the cookie jar.

```sh
curl -c /tmp/qf-cookies -H 'Origin: http://127.0.0.1:3000' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3000/api/auth/anonymous
curl -b /tmp/qf-cookies -H 'Origin: http://127.0.0.1:3000' -H 'Content-Type: application/json' -H 'Idempotency-Key: unique-request-key-001' -d '{"reason":"Fee enquiry"}' http://127.0.0.1:3000/api/services/SERVICE_ID/tickets
```

Join result: `{ "data": { "publicId": "unguessable-uuid", "existing": false } }`. An existing active participation returns the same public ID with `existing:true`. Idempotency replay returns the original result; a reused key with different payload gives 409. Key length is 8–128 characters.

Private ticket DTO includes token, status, date, assigned counter, estimate, timeline, eligibility and last sync. Public service DTO never contains ticket reasons/notes, owner IDs, password/session data, or private ticket public IDs.

## Staff

| Method | Path                                           | Payload / authority                                                                                |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`                              | `{ "email":"staff@queuefair.demo", "password":"LOCAL_ENV_VALUE" }`; sets opaque eight-hour session |
| POST   | `/api/auth/logout`                             | `{}`; revokes session                                                                              |
| GET    | `/api/staff/overview`                          | STAFF assigned services/counters, ADMIN all; no private notes                                      |
| POST   | `/api/counters/:id/activate`                   | Assigned staff/admin; `{}`                                                                         |
| POST   | `/api/counters/:id/pause`                      | Assigned; `{ "reason":"Team briefing" }`, 3–160 characters                                         |
| POST   | `/api/counters/:id/resume`                     | Assigned; `{}`                                                                                     |
| POST   | `/api/counters/:id/close`                      | Assigned; `{}`; refuses active work                                                                |
| POST   | `/api/counters/:id/call-next`                  | Assigned; `{}` + Idempotency-Key; requires ACTIVE and open service/hours                           |
| POST   | `/api/counters/:id/tickets/:ticketId/start`    | Assigned, exact active counter ticket; `{}`                                                        |
| POST   | `/api/counters/:id/tickets/:ticketId/complete` | Assigned, SERVING; `{}` + Idempotency-Key                                                          |
| POST   | `/api/counters/:id/tickets/:ticketId/miss`     | Assigned, CALLED after server grace; `{}`                                                          |

Staff cannot reorder tickets, replace active work or operate unassigned counters. No role from the client is trusted. Invalid credentials give the same 401 message. Login rate limits persist in PostgreSQL (per account and global local-demo bucket); owner joins and sensitive reads are also limited.

## Administrator

| Method | Path                                   | Payload                                                                        |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/admin/services`                  | Full service settings and counters, no ticket secrets                          |
| POST   | `/api/admin/services`                  | Complete service settings object                                               |
| PATCH  | `/api/admin/services/:id`              | Complete validated settings object (replacement of editable fields)            |
| GET    | `/api/admin/users`                     | IDs, display names and roles for assignment; no credentials                    |
| POST   | `/api/admin/counters`                  | `{ "serviceId":"...", "name":"Counter 3", "staffUserId":"optional" }`          |
| PATCH  | `/api/admin/counters/:id`              | `{ "staffUserId":"..." }`; additive assignment                                 |
| GET    | `/api/admin/analytics?from=ISO&to=ISO` | Bounded end-exclusive range, max 93 days; aggregate counts/means/sample counts |

Service example:

```json
{
  "name": "Finance Desk",
  "slug": "finance-desk",
  "prefix": "FIN",
  "description": "Fee enquiries and financial assistance.",
  "location": "Admin Block · Ground floor",
  "state": "PAUSED",
  "pauseReason": "Team briefing",
  "notice": "Please keep your ticket open.",
  "weeklyHours": { "days": [1, 2, 3, 4, 5], "open": "08:00", "close": "17:00" },
  "defaultServiceSeconds": 480,
  "gracePeriodSeconds": 120,
  "maxWaitingTickets": 100,
  "documentRequirements": ["Relevant reference"],
  "visitReasonOptions": ["Fee enquiry", "Payment verification"]
}
```

Timezone is fixed to Asia/Karachi. Prefix updates take effect when a future service day is created. Paused/closed settings need a visible reason. No deletion endpoints or browser demo reset exist. `ENABLE_DEMO_RESET` does not enable a browser handler.

## Status codes

200 successful read/mutation; 400 invalid JSON or missing idempotency key; 401 unauthenticated/invalid login; 403 forbidden role/assignment/origin; 404 missing/unowned private resource; 409 conflict, stale work, invalid transition, full/closed queue, premature missed or idempotency mismatch; 422 invalid input/range; 429 persistent rate limit; 500 safe unexpected/configuration error. Unsupported methods receive Next.js 405.
