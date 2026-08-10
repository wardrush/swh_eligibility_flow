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
filtered on `eligible is empty`. The setup below does that. Append-only still works if you
prefer it; it just costs you the reconciliation.

## Standing up the Power Automate flow

### 1. The SharePoint list

Create a **dedicated site** — not a corner of an existing one. Its permissions are the
access-control boundary for everything the site collects.

- Restrict membership to the signup and clinical staff who work the queue, via a group
  rather than named individuals.
- Turn off "Anyone with the link" sharing for the site.
- Apply a **Purview retention label** to the list matching whatever retention period
  counsel sets. Decide this before go-live; retroactive labelling is painful.
- Confirm auditing is on in Purview so list access is reviewable.

List columns: one per row of the *What is stored* table above, all single-line text except
`submitted_at` (date/time) and `elapsed_ms` (number). Add `ref` as an **indexed** column —
the flow filters on it on every result submission, and an unindexed lookup will start
failing once the list passes the 5,000-item view threshold.

### 2. The flow

Create it in a **dedicated Power Platform environment**, owned by a **service account with
co-owners**, not by an individual. A flow owned by one person stops working when that
person leaves, and nobody notices until the leads stop arriving.

**Trigger — When an HTTP request is received.** Method `POST`. Leave the request body
schema empty; supplying one forces JSON parsing, and this endpoint receives urlencoded
bodies.

**Parse the body.** Everything arrives as `application/x-www-form-urlencoded`, from both
the scripted flow and the native no-JavaScript forms, so there is one format to handle.

1. `Compose` → `raw`: `string(triggerBody())`. Run the flow once and check the trigger
   output — if you see a base64 `$content` wrapper rather than the raw string, use
   `decodeBase64(triggerOutputs()['body']['$content'])` instead.
2. `Select` → `pairs`, From `split(outputs('raw'), '&')`, in key/value mode:
   - key: `first(split(item(), '='))`
   - value: `uriComponentToString(replace(join(skip(split(item(), '='), 1), '='), '+', '%20'))`

   Replacing `+` before decoding, and re-joining on `=`, are both load-bearing: a value
   containing either character is corrupted otherwise. Let the Select build the objects
   rather than concatenating JSON by hand — a reader named O'Brien or D'Angelo will
   otherwise break the parse.
3. `Initialize variable` → `fields`, type Object, value `{}`.
4. `Apply to each` over `body('pairs')`, **concurrency set to 1**, containing a single
   `Set variable`: `fields` = `setProperty(variables('fields'), item()['key'], item()['value'])`.

Fields are then addressable as `variables('fields')?['first_name']`.

**Validate before writing.** A `Condition` that must pass all of:

- `empty(variables('fields')?['bot-field'])` — the honeypot
- `greater(int(coalesce(variables('fields')?['elapsed_ms'], '0')), 3000)` — nobody fills
  this form in under three seconds
- `less(length(outputs('raw')), 4000)` — payload ceiling
- `form-name` is one of the three known values

On failure, respond `400` and terminate. Do not write the row.

**Branch on `form-name`.**

- `contact-lead` → *Create item* in the leads list.
- `eligibility-result` → *Get items* filtered `ref eq '<ref>'`, then *Update item* on the
  match, falling back to *Create item* if there is none. The fallback matters: a reader who
  clears storage mid-flow, or whose contact post is still queued offline, arrives with a
  result and no earlier row.
- `contact-message` → *Create item* in a separate enquiries list.

**Notify.** When `clinical_review` is `yes`, send mail to the clinical inbox. Exchange
Online is in scope of the same BAA, so contact details in the body are permissible — but
send the `ref` and a link to the list item instead. One copy of a record is easier to
retain, review, and delete than two.

**Respond.** This is where it most often goes wrong.

| Case | Response |
|---|---|
| `redirect_to` is non-empty (no-JavaScript forms) | `302` with `Location: https://enrollment.switzerhealth.com` + the value |
| Otherwise (`fetch` from `flow.js`) | `200`, header `Access-Control-Allow-Origin: https://enrollment.switzerhealth.com` |

Both halves matter. Without the CORS header, `flow.js` cannot read `res.ok`, every
submission looks like a failure, and leads pile up in `localStorage` while the list stays
empty — with the rows written correctly the whole time, which makes it a memorable
afternoon to debug. And the scripted path must **not** get a 302: `fetch` follows
redirects, and the redirected request fails CORS.

Validate `redirect_to` as a site-relative path beginning with `/` before building the
`Location` header, or the endpoint becomes an open redirect.

Put the Response action *after* the SharePoint write, not before. Responding early is
faster on bad wifi, but then a failed write returns `200` and the browser discards a lead
it would otherwise have queued and retried.

### 3. Wire up the site

The URL appears in three places, all marked:

1. `assets/config.js` → `intakeEndpoint` — the scripted flow
2. `flow.html` → the fallback `<form action>`
3. `contact.html` → the enquiry `<form action>`

Then narrow `connect-src` and `form-action` in `netlify.toml` from
`https://*.logic.azure.com` to the exact host the flow was assigned.

### 4. Verify

- Complete the flow with DevTools → Network open. Both POSTs must return **200 with a CORS
  header**, and the bodies must contain contact fields and booleans only — no condition
  names, no insurance value, no home answers.
- Submit with JavaScript disabled. You should land on `/thanks.html`, not on a response
  body.
- Submit `contact.html`. Same.
- Confirm one row per person in the list, with the result merged into the contact row.

## What the migration does not fix

- **The endpoint URL is public.** A static site cannot hold a credential, so the trigger's
  `sig=` signature ships in readable JavaScript. It is write-only and returns nothing, but
  anyone can POST to it, which is why the validation step above is not optional. Regenerate
  the URL by editing and re-saving the trigger if it is ever abused.
- **Licensing.** The HTTP request trigger is a premium connector. It needs a Power Automate
  Premium seat for the flow's owner, or a per-flow plan — check current pricing, and check
  that no Power Platform **DLP policy** in your tenant blocks the HTTP trigger, which is a
  common default and fails at save time.
- **The queue holds submissions on the device.** Failed posts sit in `localStorage` until
  they flush. On a shared conference tablet that is a copy of someone's contact details on
  hardware you do not control. This was true under Netlify too; the BAA does not reach it.
- **`clinical_review = yes` next to a name is health information about an identified
  person.** Moving it under the BAA is the fix for where it was being stored, not a reason
  to treat the record as low-sensitivity now that it has arrived somewhere better.

## Remaining setup outside code

1. **Point the `enrollment` subdomain** at the site and enable HTTPS.
2. **Confirm the tenant's BAA covers Power Platform**, not just Exchange and SharePoint. It
   does under the standard DPA for paid commercial plans, but confirm it for your agreement
   rather than assuming, and re-confirm if you move to a GCC environment.
3. **Set up flow failure alerts.** Power Automate emails the flow owner on failure — with a
   service account owner, that mail needs to reach a monitored inbox, or a broken flow is
   silent.

## Before launch

- [ ] **Set the intake endpoint** in all three places listed above. Empty by default, and
      an unconfigured deploy queues every lead in the reader's browser instead of
      delivering it. Nothing on the screen looks wrong. Check the console.
- [ ] Have counsel confirm the privacy notice's description of where submissions go now
      that they land in Microsoft 365 rather than with the website host.
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
