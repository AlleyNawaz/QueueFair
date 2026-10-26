# Security policy

Scope: the current local QueueFair prototype. No production security audit or institutional approval is claimed.

Reporting contact: **[maintainer must configure a private reporting contact before publication]**. Do not post credentials, visit notes, or private ticket capabilities in a public issue. This placeholder is intentional; no reporting address has been invented.

Ownership and authentication secrets are random, hashed in PostgreSQL, and transported in HttpOnly SameSite=Lax cookies (Secure in production). Mutations require the configured Origin. Staff sessions expire in eight hours and logout revokes them. Anonymous capabilities expire in 30 days. Argon2id hashes passwords. Each privileged read and mutation checks role and service/counter assignment.

Public DTOs are allowlisted. Ticket public IDs alone grant no private reads or actions. Request errors omit stack traces and database details; visit notes and secrets are not logged by application code. Database and hosting operators remain trusted and can access stored notes. Avoid entering personal information.

Limits: anonymous device ownership is not identity verification; cookie clearing bypasses per-browser limits. Login limits are per-account and global in this local prototype. Reverse-proxy IP trust, distributed abuse defense, password reset, long-term retention policy, secure account provisioning and external audits remain deployment responsibilities. Use HTTPS, independent secrets, and restricted PostgreSQL credentials before any public use. Demo reset is CLI-only, guarded, and disabled for production.
