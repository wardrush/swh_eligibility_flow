# SwitzerHealth — RPM signup & eligibility flow

> ## ⚠️ This repository is no longer deployed. Do not deploy it.
>
> **The live build is [`aybab2/enrollment.switzerhealth.com`](https://github.com/aybab2/enrollment.switzerhealth.com)**,
> which serves `enrollment.switzerhealth.com` (and `enroll.` via a zone redirect) from
> **Cloudflare Workers**. Every page here was ported there, and lead capture moved from Netlify
> Forms to a SharePoint list written through Microsoft Graph.
>
> **Netlify is not the build for this product any more.** `netlify.toml` has been deleted, so
> pushing this repo to Netlify would publish a site with no security headers, no redirects, and
> form posts that go nowhere.
>
> What is left here is the source history and the original markup. Read it; do not ship it.
>
> **Changes belong in the Cloudflare repo.** A fix made here reaches no one.

A static signup site for consumer remote patient monitoring, originally built for
`enrollment.switzerhealth.com` on Netlify. Designed for older adults and family caregivers on a
phone, often standing in a conference hall.

No build step, no framework, no dependencies.

## Read it locally

Any static server works — the pages render, the flow clicks through, and the form posts fail
(there is no Netlify behind them any more):

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

## The enrollment mode flag — it lives in the Cloudflare repo

The live host serves **one of two** enrollment experiences, chosen by the `ENROLLMENT_MODE` var in
`wrangler.jsonc` over in `aybab2/enrollment.switzerhealth.com`:

| Mode | What a visitor gets | Where answers land |
| --- | --- | --- |
| **`forms`** ← currently live | One page wrapping the Microsoft Forms questionnaire | Microsoft Forms, in the M365 tenant |
| `quiz` | The full clickable eleven-step flow, scored in the browser | SharePoint list via Microsoft Graph |

Flipping it is a one-line change to that repo's `wrangler.jsonc` followed by a push. **There is no
flag on this side** — nothing here is served.

`forms.html` in this repo is the static twin of that page, kept because it is the last thing this
repo can still show you about the forms experience without a Worker. The **canonical** version is
`functions/lib/forms-page.js` in the Cloudflare repo; if the two ever disagree, that one is right.

One thing worth carrying in your head when the flag is on: the privacy boundary described below is
the `quiz` posture. The quiz scores its health questions in the browser and never transmits them; a
Microsoft Form submits every answer to the tenant. Both are defensible, but they are not the same
promise, and site copy should not claim the stronger one while the weaker one is live.

## The privacy boundary (read this before changing anything)

**Health answers never leave the browser.** The questions about conditions, insurance,
doctors, and the home are answered and scored entirely in client-side JavaScript. Only
contact details and two booleans are transmitted.

Two pieces of code enforce this:

- `assets/flow.js` — `TRANSMIT_FIELDS` is an explicit allow-list. `postForm()` drops every
  key not on it, so a health answer cannot reach the network even if someone later passes
  the whole answer object by mistake. No code path serializes `state.answers`.
- `flow.html` — the Netlify form declarations list only the permitted fields. Netlify
  records nothing it has not seen in the deployed markup.

The result screen can still be specific and useful, because it is rendered locally from
answers that never move. That asymmetry is the design, not an accident.

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
| `eligible` | `true` / `false` |
| `clinical_review` | `yes` / `no` — the flag for the clinical team |

## Forms — historical

Three Netlify forms, discovered by the build bot from the deployed HTML. The live build replaced
all three with a single `POST /api/enroll` writing to SharePoint:

| Form | Fires | Purpose |
|---|---|---|
| `contact-lead` | The moment the contact step is completed | Captures the lead **before** eligibility is known, so an interrupted signup is still reachable |
| `eligibility-result` | On the result screen | Carries the same `ref` plus the two booleans |
| `contact-message` | `contact.html` | General enquiries |

Submissions are **append-only** — Netlify has no way to update an earlier one. A
`contact-lead` row with no matching `eligibility-result` row is someone who dropped out
partway, which is exactly the follow-up list to work.

## Manual setup in the Netlify UI — historical

Kept for the record. **None of this is live**, and the Netlify site should be decommissioned once
its submissions have been exported (see "Decommissioning" below). The equivalent one-time setup for
the live build — Entra app registration, the `Sites.Selected` grant, the SharePoint list schema,
the Cloudflare custom domain and WAF rule — is in the Cloudflare repo's README.

These could not be done from code:

1. **Enable Forms** in Site configuration → Forms.
2. **Add email notifications.** Point `eligibility-result` at the clinical inbox and
   `contact-lead` at whoever works the general list. Filter on `clinical_review = yes`.
3. **Check the plan tier before any event.** The free tier allows **100 form submissions
   per month**, after which submissions are rejected. A single conference can exhaust that
   quietly. This is the most likely way the site fails in the field — verify it first.
4. **Point the `signup` subdomain** at the site and enable HTTPS.
5. **Enable spam filtering.** Both forms already carry a `bot-field` honeypot.

## Decommissioning

- [ ] **Export the Netlify form submissions to CSV before deleting the site.** `contact-lead`,
      `eligibility-result`, and `contact-message`. They are the only copy — nothing was replayed
      into SharePoint during the port.
- [ ] Delete the Netlify site, or at minimum unlink it from this repository so a push cannot
      republish a headerless build.
- [ ] Repoint any DNS still aimed at Netlify. `enrollment.` and `enroll.` are already on
      Cloudflare; check the `signup` subdomain, and any QR code or print run that used it.
- [ ] Archive this repository on GitHub once the above are done.

## Before launch — carried over to the Cloudflare repo

These were open when the port happened and are tracked there now. Fixing them here fixes nothing.

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
