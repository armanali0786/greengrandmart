# Privacy / Data Handling — GreenGrandMart

**Companion docs:** `Security.md` (technical controls) · `Data_Model_DB_Schema.md` · `PRD.md`
**Purpose:** what personal data GreenGrandMart collects, why, how long it's kept, who it's shared with, what control users have over it, and how the platform meets India's DPDP Act, 2023 obligations at a practical level.
**Note:** this document describes the intended data handling design. It is not legal advice — final consent language, retention periods, and DPDP compliance posture should be reviewed with a qualified professional before launch, same caveat as GST in `Product_Spec_Requirements.md`.

---

## 1. Roles Under DPDP, 2023

- **GreenGrandMart is the Data Fiduciary** — it determines the purpose and means of processing customer personal data.
- **Sub-processors (Data Processors)** acting on GreenGrandMart's behalf: Firebase (Google) for authentication and file storage, Neon for database hosting, Razorpay for payment processing, MSG91 for SMS delivery, Resend for email delivery, Vercel for application hosting.
- **Data Principals** are the platform's customers (and, distinctly, its staff/admin users) whose personal data is processed.

---

## 2. Personal Data Inventory

| Category                      | Fields                                                                                                | Collected at              | Purpose                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Identity**                  | Name, email, phone                                                                                    | Registration              | Account creation, order communication, COD confirmation                                                     |
| **Address**                   | Full shipping/billing address, phone, name                                                            | Checkout / address book   | Order fulfillment, invoicing                                                                                |
| **Authentication**            | Firebase UID, hashed credentials (held by Firebase, not GreenGrandMart directly), OAuth link (Google) | Registration/login        | Account access                                                                                              |
| **Transactional**             | Order history, cart contents, payment status (not card details), amounts                              | Shopping activity         | Order processing, customer support, tax records                                                             |
| **Payment metadata**          | Razorpay payment ID, payment method type (card/UPI/etc.), NOT card number/CVV                         | Checkout                  | Payment reconciliation — actual card data never reaches GreenGrandMart's systems, held entirely by Razorpay |
| **Communication preferences** | Email/push opt-ins, device tokens (FCM)                                                               | Account settings          | Sending order updates, respecting opt-outs                                                                  |
| **Behavioral/usage**          | Product views, searches, cart adds (analytics events)                                                 | Browsing activity         | Improving catalog/search, no individual profiling sold or shared externally                                 |
| **Reviews/UGC**               | Review text, rating, optional review images                                                           | Product review submission | Public display on product pages (with consent implicit in submission)                                       |
| **Support/communication**     | Any messages sent to customer support (if/when a support channel exists)                              | Customer-initiated        | Resolving issues                                                                                            |

**Not collected:** government ID numbers, biometric data, precise geolocation, health data, financial account numbers (bank/card details are never received — handled entirely by Razorpay).

---

## 3. Legal Basis & Consent

- **Consent** is the primary basis for processing under DPDP — collected at account registration via clear notice (not pre-ticked boxes) covering: what's collected, why, and who it's shared with.
- **Necessary processing** (order fulfillment, invoicing, fraud prevention, legal/tax record-keeping) proceeds as a legitimate necessary function of providing the requested service, per DPDP's allowance for processing necessary to perform a contract the individual is party to.
- **Marketing communications** (promotional email/push, distinct from transactional order updates) require separate, explicit opt-in — never bundled into the general account-creation consent, and always with a clear, one-click opt-out.
- **Consent withdrawal:** a user can withdraw marketing consent at any time from Account → Notifications → Preferences; withdrawal does not affect the lawfulness of processing already carried out, and does not affect transactional communications necessary for order fulfillment (order confirmations, shipping updates are not "marketing" and aren't gated by this toggle).
- **Children's data:** the platform is not designed for or targeted at children; account creation is not knowingly permitted for users below the applicable age threshold, and no age-gating workaround should be implemented to circumvent this.

---

## 4. Data Retention

| Data category                       | Retention period                                                                                                                                                             | Rationale                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Active account profile              | Until account deletion requested                                                                                                                                             | Ongoing service provision                                                                                         |
| Order & invoice records             | Retained per applicable Indian tax/accounting record-keeping requirements (commonly multi-year — confirm exact duration with a tax professional) even after account deletion | Legal/tax obligation overrides deletion request for this specific data                                            |
| Payment metadata (non-card)         | Same retention as associated order                                                                                                                                           | Reconciliation, dispute handling, tax records                                                                     |
| Cart data (abandoned)               | Purged after a defined inactivity period (e.g. 30 days)                                                                                                                      | No ongoing purpose once abandoned                                                                                 |
| OTP requests (`otp_requests` table) | Purged after 24 hours via daily cleanup job                                                                                                                                  | No purpose beyond the immediate verification window; retaining longer only increases exposure risk for no benefit |
| Audit logs                          | Retained for a defined compliance window (e.g. 1–3 years, confirm business requirement)                                                                                      | Security/accountability record                                                                                    |
| Analytics events                    | Retained in aggregate/anonymized form beyond a rolling window (e.g. 12 months for raw events)                                                                                | Trend analysis without indefinite raw personal data retention                                                     |
| Marketing consent records           | Retained as long as needed to demonstrate consent was given/withdrawn                                                                                                        | Accountability requirement under DPDP                                                                             |
| Deleted account PII                 | Anonymized (not retained) except where legally required (see below)                                                                                                          | Honors deletion request while preserving legally mandated records                                                 |

**On account deletion:** per `Product_Spec_Requirements.md` Section 1.4, the user's name/email/phone are stripped from the `users` record and replaced with anonymized placeholders; associated `orders`/`order_items` rows are retained (order totals, dates, line items) because these are financial/tax records, but they no longer resolve back to an identifiable person once the `users` row is anonymized. Addresses tied to deleted accounts are deleted outright (not needed for tax records, unlike the order/invoice line items themselves).

---

## 5. Third-Party Data Sharing

| Recipient                   | Data shared                                                                                | Purpose                           | Data location note                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| Firebase (Google)           | Name, email, phone (for auth); uploaded images                                             | Authentication, file storage      | Google Cloud infrastructure; review Google's DPDP-relevant terms                    |
| Razorpay                    | Name, email, phone, order amount (not full address unless required for their fraud checks) | Payment processing                | RBI-regulated payment aggregator, subject to its own compliance obligations         |
| MSG91                       | Phone number, OTP code (transient)                                                         | SMS delivery for COD confirmation | India-based SMS provider                                                            |
| Resend                      | Email address, order/notification content                                                  | Transactional email delivery      | Confirm data residency terms in their DPA before launch                             |
| Neon                        | All application data (hosted database)                                                     | Application data storage          | Confirm hosting region; prefer a region consistent with data residency expectations |
| Vercel                      | Request metadata, application logs                                                         | Hosting/CDN                       | Standard hosting sub-processor                                                      |
| Courier/shipping partner(s) | Name, phone, shipping address                                                              | Delivery fulfillment              | Necessary disclosure for the specific order only                                    |

**No data is sold to third parties.** No data is shared with advertisers or data brokers. Any future addition of a third-party analytics or marketing tool must be reviewed against this list and disclosed in the privacy notice before being enabled.

---

## 6. User Rights & How They're Exercised

| Right                        | How exercised in-product                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access their data            | Account → Profile / Order History / Addresses already surfaces most personal data directly; a "download my data" export can be added as a self-service feature or handled manually via support request at launch scale |
| Correct their data           | Account → Profile / Addresses — directly editable                                                                                                                                                                      |
| Withdraw consent (marketing) | Account → Notifications → Preferences toggle                                                                                                                                                                           |
| Delete their account         | Account → Security → Delete Account (re-authentication required, see `Security.md` Section 3)                                                                                                                          |
| Grievance/complaint          | A designated contact method (email/support channel) must be published — required under DPDP for a Data Fiduciary to have a grievance redressal mechanism                                                               |

At current scale, "download my data" can reasonably start as a manual, support-handled process rather than an automated export feature — but the grievance contact and the in-product deletion/correction paths above are not optional deferrals.

---

## 7. Data Access Within the Organization

- **Customers** can only ever access their own data (enforced via ownership checks per `Security.md` Section 4.3) — no customer-facing feature exposes another customer's PII.
- **Staff role** can view customer order history for support purposes but does not have broader access (e.g. no refund initiation, no role management, no audit log access) — access is scoped to what's needed for the support/operations function, not blanket visibility.
- **Admin role** has full access, which is itself a reason every admin action touching customer data (viewing another customer's full profile, exporting data, changing records) should be considered for audit logging even beyond the "sensitive write" list in `Security.md` Section 7, if usage patterns suggest it's warranted.
- **No blanket database access** for non-engineering staff — any ad hoc data lookup needed for support should go through the admin UI, not direct database queries, so that access is logged and scoped.

---

## 8. Encryption

(Cross-reference: `Security.md` Section 11 covers this from a technical-control angle; this section frames it from a data-protection-obligation angle.)

- **In transit:** all data between client, application, and every third-party service travels over HTTPS/TLS — no exceptions.
- **At rest:** managed automatically by each sub-processor (Neon encrypts Postgres storage; Firebase encrypts Auth/Storage data at rest) — this satisfies "reasonable security safeguards" expected under DPDP without requiring bespoke application-level encryption for most fields.
- **Sensitive fields requiring extra handling:** OTP codes are hashed (not merely encrypted) since they never need to be reversed, only compared — this is a stronger guarantee than encryption alone.
- **What's explicitly never stored:** card numbers, CVVs, bank account numbers — payment instrument data never reaches GreenGrandMart's database at all, eliminating an entire class of encryption/exposure risk by design rather than by control.

---

## 9. Cookies & Tracking

| Cookie/storage type                                                  | Purpose                                 | Consent needed                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth session token                                          | Keeping the user logged in              | Strictly necessary — no consent banner required for this category                                                             |
| Guest cart session ID                                                | Persisting a guest's cart across visits | Strictly necessary                                                                                                            |
| Analytics (if/when added, e.g. Vercel Analytics, Firebase Analytics) | Understanding traffic/usage patterns    | Disclosed in a cookie/privacy notice; use privacy-respecting, aggregated analytics rather than cross-site ad-tracking cookies |

GreenGrandMart does not use third-party advertising cookies or cross-site tracking pixels. If this changes in the future, a consent banner distinguishing "strictly necessary" from "optional" cookies must be added before deployment of any tracking cookie.

---

## 10. Data Breach Handling

(Cross-reference: `Security.md` Section 13 for technical incident response steps.)

- Under DPDP, a Data Fiduciary is expected to notify the Data Protection Board and, in relevant cases, affected individuals in the event of a personal data breach.
- Practically: any suspected exposure of customer PII (database access anomaly, leaked credential providing data access, third-party sub-processor breach affecting GreenGrandMart data) triggers: (1) contain and assess scope, (2) determine what categories of data and how many individuals are affected, (3) consult legal/compliance guidance on notification obligations and timelines, (4) notify affected users transparently once scope is understood.
- This document does not define exact notification timelines or thresholds — those should be finalized with legal counsel before launch, as DPDP's specific procedural requirements should be mapped to an actual incident response runbook rather than approximated here.

---

## 11. Privacy Notice Requirements (for the actual customer-facing policy page)

The public Privacy Policy page (a separate deliverable from this internal doc, but derived from it) must plainly state:

- What categories of personal data are collected (Section 2)
- The purpose of each category of collection
- Which third parties data is shared with and why (Section 5)
- Retention approach (Section 4, in plain language)
- How to exercise rights (access, correction, deletion, consent withdrawal) (Section 6)
- Grievance/contact information
- That the platform does not sell personal data

This internal doc is the source of truth engineers and product should build against; the public-facing policy page should be reviewed by legal counsel before publishing, using this doc as its factual basis.

---

## 12. Open Items Requiring Business/Legal Decision

- Exact retention period for order/invoice records under applicable Indian tax law (commonly cited ranges vary — confirm with a tax professional)
- Whether a self-service "download my data" export is built at launch or deferred to a manual support process
- Final grievance officer/contact details required for DPDP compliance
- Confirmation of data residency terms with Resend and any other sub-processor whose default hosting region isn't India
- Audit log retention period (compliance vs. storage cost tradeoff)
