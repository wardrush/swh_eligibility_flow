# SwitzerHealth — RPM signup & eligibility flow

A static signup site for consumer remote patient monitoring, built for
`enrollment.switzerhealth.com`. Designed for older adults and family caregivers on a phone,
often standing in a conference hall.

No build step, no framework, no dependencies. The repository root is the deployable site.

## Run it locally

Any static server works:

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

To exercise the header and redirect rules:

```bash
npx netlify dev
```

Submissions post to the Power Automate endpoint in `assets/config.js`, which is the same
endpoint in every environment unless you stand up a second flow. Point `intakeEndpoint` at
a scratch flow before testing, or leave it empty — with no endpoint configured, submissions
queue in `localStorage` and log to the console rather than reaching the live list.

## The privacy boundary (read this before changing anything)

**Health answers never leave the browser.** The questions about conditions, insurance,
doctors, and the home are answered and scored entirely in client-side JavaScript. Only
contact details and two booleans are transmitted.

One piece of code enforces this: `assets/flow.js` — `TRANSMIT_FIELDS` is an explicit
allow-list, and `postForm()` drops every key not on it, so a health answer cannot reach the
network even if someone later passes the whole answer object by mistake. No code path
serializes `state.answers`.

It used to be two. The Netlify form declarations in `flow.html` were a second, independent
gate — Netlify recorded nothing it had not seen in the deployed markup. Power Automate has
no equivalent; the flow accepts whatever it is sent. **The allow-list in `flow.js` is now
the only thing standing between the answers and the wire.** Treat edits to it accordingly.

The result screen can still be specific and useful, because it is rendered locally from
answers that never move. That asymmetry is the design, not an accident.

Note that the boundary is now a choice rather than a constraint. It existed because Netlify
had no BAA and the answers therefore *could not* be sent. The destination is now covered,
so widening the allow-list is permissible — but it is a policy decision that pulls in the
privacy notice, the consent wording, retention labels, and access review. It is not a
cleanup task.

**To verify after any change:** open DevTools → Network, complete the flow, and inspect
both POST bodies. They must contain contact fields and booleans only — no condition names,
no insurance value, no home answers.

### What is stored

| Field | Notes |
|---|---|
| `ref` | Short random ID linking the two submissions |
| `first_name`, `last_name` | |
| `email`, `phone` | At least one; never both required |
| `zip` | |
| `preferred_contact` | `email` / `phone` / `either` |
| `contact_optin` | `yes` / `no` — unchecked by default |
| `signing_up_for` | `self` / `loved-one` |
| `source` | From `?src=` or `?utm_source=` |
| `consent_text`, `submitted_at` | The exact consent wording shown, plus a timestamp |
| `elapsed_ms` | Milliseconds from page load to submit — an anti-abuse signal, not data about the person |
| `eligible` | `true` / `false` |
| `clinical_review` | `yes` / `no` — the flag for the clinical team |

Two further fields travel but are never stored: `form-name`, which tells the flow which
branch to take, and `redirect_to`, which the no-JavaScript forms send to ask for a 302
back to the thank-you page.

## Where submissions go

Straight from the browser to a **Power Automate HTTP trigger** in the SwitzerHealth
Microsoft 365 tenant, which writes to a **SharePoint list**. Both services are in scope of
Microsoft's HIPAA BAA, which is incorporated into the Microsoft Products and Services Data
Protection Addendum for paid commercial plans — there is no separate contract to sign.

```
browser ──POST──▶ Power Automate HTTP trigger ──▶ SharePoint list
   │                                                    │
   │                                                    └─▶ email to clinical inbox
   └─ Netlify serves the static page and nothing else
```

**The browser posts directly, and that is the whole point.** Proxying through a Netlify
function would be easier to secure — the endpoint URL could stay secret — but it would put
contact details and the clinical-review flag through a processor with no BAA. Netlify does
offer HIPAA-eligible hosting, but only on Enterprise. Keeping the submission path
browser → Microsoft means the hosting platform serves static files and sees nothing.

Three logical forms, distinguished by the `form-name` field:

| `form-name` | Fires | Purpose |
|---|---|---|
| `contact-lead` | The moment the contact step is completed | Captures the lead **before** eligibility is known, so an interrupted signup is still reachable |
| `eligibility-result` | On the result screen | Carries the same `ref` plus the two booleans |
| `contact-message` | `contact.html` | General enquiries |

Under Netlify these were append-only, and a `contact-lead` row with no matching
`eligibility-result` row *was* the drop-out list. The flow can now look up the earlier row
by `ref` and update it, so one person is one row and the drop-out list becomes a view
filtered on `eligible is empty`. The runbook does that. Append-only still works if you
prefer it; it just costs you the reconciliation.

## Standing up the backend

The full runbook lives in **[`docs/m365-setup.md`](docs/m365-setup.md)** — service account
and licensing, the SharePoint lists, the Power Platform environment, every action in the
flow, and the traps worth knowing before you hit them. Work through that document; this
README covers the site code only.

Two things from it are worth repeating here, because they are the ones that bite from the
code side:

- **The flow must answer `200` with an `Access-Control-Allow-Origin` header** for the
  scripted path. Without it `flow.js` cannot read `res.ok`, every submission looks like a
  failure, and leads pile up in `localStorage` while the rows are being written correctly
  the whole time.
- **The endpoint URL goes in three places**: `assets/config.js` (`intakeEndpoint`),
  `flow.html`'s fallback `<form action>`, and `contact.html`'s enquiry `<form action>`.
  Then narrow `https://*.logic.azure.com` in `netlify.toml` to the assigned host.

## Before launch

- [ ] **Set the intake endpoint** in all three places listed above. Empty by default, and
      an unconfigured deploy queues every lead in the reader's browser instead of
      delivering it. Nothing on the screen looks wrong. Check the console.
- [ ] Have counsel confirm the privacy notice's description of where submissions go now
      that they land in Microsoft 365 rather than with the website host.
- [ ] Point the `enrollment` subdomain at the site and enable HTTPS.
- [ ] Work through [`docs/m365-setup.md`](docs/m365-setup.md) to the end, including the
      verification steps — the site cannot be tested without the backend standing up.
- [x] Contact details are live: `385-340-3130` and `care@switzerhealth.com` (catch-all
      domain). They appear in every page header/footer, `flow.js`, and `privacy.html`.
- [ ] Replace `assets/logo-mark.svg` with the official vector from marketing — the current
      file is a hand-reconstruction traced from the brand book. The inline copies in each
      page's header need the same path data. The **wordmark** needs no asset; it is live
      Helvetica Bold text, per the brand book.
- [ ] **Verify every statistic** in the References section of `index.html` against the
      source PDFs. The citations were assembled from bibliographic records, not full texts.
- [ ] Have counsel review `privacy.html` and add an effective date.
- [ ] Confirm the TCPA consent wording in `flow.js` (`CONSENT_TEXT`, `OPTIN_TEXT`) is what
      compliance wants. It is stored verbatim with each submission as evidence.

## Brand

`assets/tokens.css` is the only file to edit for styling. Everything resolves back to a
variable declared there.

From the *SwitzerHealth Brand Positioning System, Phase One*:

- Swiss Red `#D52B1E` (Pantone 485C), Deep Charcoal `#2D2D2D`, Deep Navy `#1B2A4A`, White
- Helvetica, Arial fallback — no webfont, nothing to download
- Swiss International Typographic Style: strict grid, generous whitespace, red used sparingly

**Contrast rules, computed and enforced in `app.css`:**

| Pairing | Ratio | Rule |
|---|---|---|
| Charcoal on white | 13.8:1 | AAA — default body text |
| Navy on white / white on navy | 14.2:1 | AAA — hero |
| White on Swiss Red | 5.0:1 | AAA for **large text only** — red buttons must keep ≥24px bold labels |
| Red on white | 5.0:1 | Large headings and accents only, **never body copy** |
| **Red on navy** | **2.8:1** | **Fails. Never do this.** `.on-dark` swaps red for white. |

Only the brand book's **approved core claims** appear on the site. The conditional and
internal claims (§9–10) — "our FDA-cleared device", "pioneered", "up to 90% qualify",
any dollar figure, any CoCM reference — are deliberately absent. Both required disclaimers
appear verbatim in the footer of every page and on the result screen.

## Accessibility

Acceptance criteria, not aspirations:

- Base font **20px**, rising to **22px** on phones, scaled from the reader's own browser
  setting rather than overriding it. Nothing below 18px anywhere.
- Tap targets **≥60px**, answers are full-width tappable cards.
- One question per screen; progress stated in words ("Question 4 of 11").
- Explicit Back and Next — **no auto-advance**. Predictability over speed.
- Selected state signals through border, background, *and* a filled control — never colour
  alone. Errors carry a glyph and plain-language text.
- No modals, carousels, timeouts, or autoplay. `prefers-reduced-motion` honoured.
- Focus moves to the new question on every step change and is never suppressed.
- Full keyboard operation; the native inputs stay in the DOM and stay focusable.
- **Works with JavaScript off** — `flow.html` falls back to a plain contact form.

Re-test at 320px, 375px, 768px, and at **200% browser zoom**, which is how much of this
audience actually browses.

## Conference resilience

A failed submission is parked in `localStorage` and retried on the next page load and on
the browser's `online` event, so a lead is not lost to a dead hotspot. Each submission also
gets a short reference number, shown on the result screen, so someone who calls in can be
found immediately.
