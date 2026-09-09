# Observability — GreenGrandMart

**Companion docs:** `Security.md` (Section 12, Logging) · `Deployment.md` · `Error_Handling.md`
**Purpose:** how the team knows the system is healthy, finds out quickly when it isn't, and has enough information to diagnose an issue without guessing.

---

## 1. Tooling

| Concern                              | Tool                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error tracking                       | Sentry                                                                                                                                                                           |
| Application performance / Web Vitals | Vercel Analytics + Vercel Speed Insights                                                                                                                                         |
| Infrastructure/function logs         | Vercel's built-in function logs                                                                                                                                                  |
| Database performance                 | Neon's built-in query insights / `EXPLAIN ANALYZE` for manual investigation                                                                                                      |
| Uptime                               | Vercel's own platform status + an external uptime check (e.g. a simple cron-based health-check ping, or a free tier of an uptime monitor) hitting the homepage and one API route |
| Background job health                | Custom admin-visible "failed jobs" view (built on the `job_queue` table) — no external tool needed at this scale                                                                 |

No dedicated logging aggregation service (e.g. Datadog, ELK) is introduced at this scale — Vercel's function logs plus Sentry cover the practical need. Revisit only if log volume or team size grows enough to justify the cost (see `Architecture.md` Section 9 scaling triggers).

---

## 2. What Gets Logged

### 2.1 Always logged (structured, server-side)

- Every unhandled exception, with stack trace, request path, and (if available) user ID — sent to Sentry automatically via its Next.js integration
- Authentication failures: invalid/expired token, failed login attempts (email + timestamp + IP, never the attempted password)
- Authorization failures: which user, which resource, which action was denied
- Every admin write action captured via `withAudit()` — separate from application logs, stored in `audit_logs` for permanent, queryable history
- Payment state transitions: order ID, from-status, to-status, triggering event (client-confirm vs webhook)
- Webhook processing outcomes: event ID, event type, processed/skipped-as-duplicate/failed
- Rate-limit triggers: which endpoint, which identity (user/IP), how many requests
- Background job failures: job type, payload (redacted if it contains PII/secrets), attempt count, error

### 2.2 Never logged (cross-reference `Security.md` Section 12)

- Passwords (never received by the app)
- OTP codes, at any log level, including debug
- Razorpay signatures, webhook secrets, API keys, Firebase Admin credentials
- Full card/payment instrument details (never received by the app)
- Unredacted full request bodies on auth-adjacent or payment endpoints

### 2.3 Log levels

| Level   | Used for                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| `error` | Unhandled exceptions, failed payment/webhook processing, failed background jobs after exhausting retries           |
| `warn`  | Rate-limit triggers, authorization failures, a job retry (not yet exhausted), a reconciliation mismatch            |
| `info`  | Order state transitions, successful payment captures, successful admin actions (in addition to the audit log)      |
| `debug` | Local development only — verbose request/response shape logging, disabled in Preview/Staging/Production by default |

---

## 3. Metrics

Tracked via Vercel Analytics (traffic/performance) and simple queries against the application database (business metrics) rather than a dedicated metrics/APM pipeline at this scale.

| Metric                                            | Source                                                                       | Reviewed                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Core Web Vitals (LCP, INP, CLS)                   | Vercel Speed Insights                                                        | Weekly, and after any frontend-heavy release                   |
| Function invocation count / duration / error rate | Vercel dashboard                                                             | Weekly, and immediately post-deploy                            |
| API error rate (4xx/5xx by route)                 | Sentry issue trends + Vercel function logs                                   | Daily glance, deeper review weekly                             |
| Checkout completion rate                          | Query: orders reaching `confirmed` ÷ checkout attempts started               | Weekly business review                                         |
| Payment failure rate                              | Query: `payments.status = 'failed'` ÷ total payment attempts                 | Weekly; investigate if it exceeds the 3% target from `PRD.md`  |
| Webhook processing latency                        | Timestamp diff between `webhook_events.created_at` and `processed_at`        | Spot-checked if payment confirmation delays are reported       |
| Background job failure rate                       | Query: `job_queue.status = 'failed'` ÷ total jobs                            | Daily glance via the admin "failed jobs" view                  |
| Database query latency (slow queries)             | Neon insights                                                                | Monthly review, or triggered by a user-reported slowness issue |
| Low-stock incidents                               | Admin dashboard widget (already a product feature, doubles as an ops signal) | Daily by store operations, not just engineering                |

---

## 4. Tracing

Full distributed tracing (e.g. OpenTelemetry spans across services) is **not** implemented at this scale — with a single deployable app and no microservices, a trace would mostly just reflect a single request's function execution, which Sentry's performance monitoring and Vercel's function logs already capture adequately.

**What substitutes for tracing here:**

- Every order carries its own natural "trace" through `order_status_history` and `webhook_events` — reconstructing what happened to a specific order is a query against these tables by `order_id`, not a distributed trace lookup.
- Sentry's request context (attached automatically to error events) captures the request path, user ID, and relevant breadcrumbs leading up to an error.

Revisit this if/when a module is extracted into its own service (per `Architecture.md` Section 9) — that's the point where a request genuinely crosses a network boundary and correlation IDs/tracing become worth the investment.

---

## 5. Alerts

| Condition                                                                                      | Alert channel                                                                                                                    | Urgency                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Error rate spike (Sentry threshold, e.g. >10 new errors in 5 minutes)                          | Sentry → email/Slack notification                                                                                                | Immediate                                                         |
| Payment webhook failures (signature failures beyond a baseline, or repeated processing errors) | Sentry alert on the webhook handler's error events                                                                               | Immediate — this is the most business-critical path in the system |
| Background job stuck/failing repeatedly (e.g. `job_queue` rows exceeding `max_attempts`)       | Daily digest at minimum; consider an immediate alert if `send_email`/`send_sms` failures affect order confirmations specifically | Same-day                                                          |
| Uptime check failure (homepage or health-check route down)                                     | External uptime monitor → email/SMS to on-call person                                                                            | Immediate                                                         |
| Low-stock threshold crossed for any product                                                    | Already surfaced in-app on the admin dashboard                                                                                   | Business-hours, not an urgent page                                |
| Unusual spike in rate-limit triggers (possible attack/bot activity)                            | Weekly review is sufficient at current traffic; escalate to immediate if a spike is large enough to threaten availability        | Situational                                                       |
| Neon compute/storage approaching plan limits                                                   | Neon's own usage dashboard/alerts                                                                                                | Weekly review, escalate before hitting a hard limit               |

At this team size, "alerting" is realistically a Slack/email notification to a small number of people rather than a formal on-call rotation with paging — right-sized for the scale, revisit if the team or traffic grows enough to need shift-based on-call.

---

## 6. Dashboards

- **Sentry issue dashboard**: default view, filtered to unresolved issues, reviewed daily.
- **Vercel dashboard**: deployment status, function performance, bandwidth usage — reviewed weekly and immediately after every deploy.
- **Admin "Ops" view (in-app)**: today's sales, pending orders, low-stock items, failed background jobs, pending returns/refunds — this doubles as both a business dashboard and an informal health dashboard, reviewed daily by whoever is operating the store.
- **Neon dashboard**: compute hours, storage, active connections — reviewed monthly against the cost budget in `ECOMMERCE_IMPLEMENTATION_PLAN.md`.

---

## 7. Post-Incident Review

After any incident that triggered an alert or caused visible customer impact (failed checkouts, missed order confirmations, downtime):

1. Write a short summary: what happened, when detected, when resolved, root cause.
2. Identify whether better logging/metrics/alerting would have caught it sooner — if so, add that instrumentation as part of the fix, not as a someday-backlog item.
3. If the incident involved payment or inventory correctness, cross-check `webhook_events`, `order_status_history`, and `inventory_movements` for the affected records to confirm no lasting data corruption remains.

No formal blameless-postmortem template is mandated at this scale — but the three steps above are non-negotiable for anything that touched checkout, payments, or inventory correctness.
