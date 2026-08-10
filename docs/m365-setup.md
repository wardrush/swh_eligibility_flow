# Standing up the Microsoft 365 backend

Everything needed to take the enrollment site from "code is ready" to "submissions land in
SharePoint". Work top to bottom; each section depends on the ones above it.

The site code is finished and needs no further changes except pasting in the endpoint URL
(§6). See the README for how the client side works and what it deliberately does not send.

## What this builds

```
browser ──POST──▶ Power Automate HTTP trigger ──▶ SharePoint list
   │                                                    │
   │                                                    └─▶ mail to the clinical inbox
   └─ Netlify serves the static page and nothing else
```

Submissions go **from the browser straight to Power Automate**. Proxying them through a
function on the hosting platform would be easier to secure — the endpoint URL could stay
secret — but it would put contact details and the clinical-review flag through a processor
with no BAA. Power Automate, SharePoint, and Exchange Online are all in scope of the
Microsoft BAA, which is incorporated into the Microsoft Products and Services Data
Protection Addendum for paid commercial plans. There is no separate contract to sign, but
confirm Power Platform is in scope of *your* agreement rather than assuming.

## Progress

- [x] Service account `svc-automation@switzerhealth.com` created ("SwitzerHealth Automation")
- [x] Security group `SG-Service-Accounts` created
- [x] Passkey registered and stored in the Proton Pass shared vault
- [ ] **Verify** usage location is set (`US`) — §1
- [ ] **Verify** the passkey profile is scoped to the group, not tenant-wide — §1
- [ ] TOTP backup registered in the same Proton Pass item — §1
- [ ] Licenses assigned — §1
- [ ] Conditional Access policy — §1
- [ ] SharePoint site and list — §2
- [ ] Send As on the clinical shared mailbox — §3
- [ ] Power Platform environment and DLP policy — §4
- [ ] The flow — §5
- [ ] Endpoint URL pasted into the site, CSP narrowed — §6
- [ ] Verified end to end — §7
- [ ] Co-owners and failure alerting — §8

---

## 1. Identity

The service account owns the flow **and its connections**. The connections are the part
that matters: each SharePoint and Outlook action runs through a connection bound to
whoever was signed in when it was created. Bind those to a person and they break when that
person leaves, changes their password, or gets caught by a new Conditional Access policy.
Adding co-owners does not fix it — co-owners cannot repair a connection they do not own.

### Verify what is already done

- **Usage location.** Entra admin center → Identity → Users → the account → Properties →
  Edit properties → **Settings** → Usage location = `US`. Licence assignment fails silently
  without it. Note this is *not* the Country/Region field on the same page.
- **Passkey profile scope.** Protection → Authentication methods → Policies →
  Passkey (FIDO2). The profile that permits synced passkeys should target
  `SG-Service-Accounts` only, with attestation disabled. The default profile should stay
  strict — attestation enforced, device-bound only — so normal staff are unaffected.

  With attestation disabled, AAGUID restrictions are advisory rather than enforceable;
  Entra cannot cryptographically confirm the passkey lives in Proton Pass. That is an
  acceptable trade for a profile covering one service account. It would not be tenant-wide.
- **The passkey is in the shared vault, not a personal one.** Easy to get wrong, and not
  noticed until the one person who has it is unreachable.

### Still to do

**Register a TOTP backup** in the same Proton Pass item. During Authenticator setup choose
"Can't scan image?" to reveal the secret and paste it in. If Proton is unreachable or the
passkey is lost, this is the way back in — and an account nobody can sign into is a flow
nobody can repair.

**Assign licenses** (M365 admin center → the account → Licenses and apps):

| License | Why |
|---|---|
| Base M365 SKU (Business Basic tier is enough) | SharePoint site access and a mailbox to send from |
| **Power Automate Premium** | The HTTP request trigger is a premium connector |

Roughly $22/month combined. Do **not** buy the Power Automate Process license — it is
priced per-process for when you cannot license the people involved, and is ~10× the cost
for a single flow with a single owner.

Licensing is not instant. Power Automate Premium appears quickly; the mailbox can take
15 minutes to an hour. An account with no mailbox yet is provisioning, not broken.

**Conditional Access**, scoped to `SG-Service-Accounts`: require phishing-resistant MFA,
block legacy auth. Two cautions:

- Think hard before adding IP or named-location restrictions. Locking the account to the
  office means you cannot repair a broken flow from home at a weekend, which is when you
  will need to.
- **Exclude it from aggressive sign-in-frequency policies.** The flow's connections run on
  refresh tokens obtained when the connections are created. Forced re-auth invalidates
  those tokens and the flow begins failing silently.

## 2. SharePoint

Create a **dedicated site** — not a corner of an existing one. Its permissions are the
access-control boundary for everything the enrollment site collects.

- Restrict membership to the signup and clinical staff who work the queue, via a group
  rather than named individuals.
- Add `svc-automation` to the site members (write access).
- Turn off "Anyone with the link" sharing for the site.
- Apply a **Purview retention label** matching whatever retention period counsel sets.
  Decide this before go-live; retroactive labelling is painful.
- Confirm auditing is on in Purview so list access is reviewable.

Two lists:

**`Enrollment leads`** — one column per row of the *What is stored* table in the README,
all single-line text except `submitted_at` (date/time) and `elapsed_ms` (number).

Make `ref` an **indexed** column. The flow filters on it on every result submission, and an
unindexed lookup starts failing once the list passes the 5,000-item view threshold.

**`Enrollment enquiries`** — for `contact-message`: `name`, `email`, `phone`, `message`,
`contact_optin`, `submitted_at`.

## 3. Exchange

Exchange admin center → Recipients → Mailboxes → the clinical shared mailbox →
**Delegation → Send As** → add `svc-automation`.

This is what lets the notification arrive *from* the clinical address rather than from a
service account nobody recognises. A shared mailbox cannot itself be a connection account,
but a licensed service account with Send As can send on its behalf.

## 4. Power Platform environment

`admin.powerplatform.microsoft.com` → Environments → **New** → a dedicated Production
environment. Add `svc-automation` as Environment Maker.

Not the Default environment. That is where every user's personal flows live and everyone is
a Maker, so you cannot apply a tight DLP policy without affecting the whole company.

Scope a **DLP policy** to the new environment allowing only SharePoint, Office 365 Outlook,
and HTTP. Check no existing tenant-wide DLP policy blocks the HTTP trigger — that is a
common default, and it fails at save time rather than at design time.

## 5. The flow

> **Sign in as `svc-automation` first.** Build the flow and create *every connection* while
> signed in as it. Building as yourself and transferring ownership afterwards leaves the
> connections behind you, which is the exact failure this whole setup exists to avoid.
>
> Use a separate browser profile rather than an incognito window you will close. Connection
> repair is a two-minute job with a signed-in profile and a half-hour job without one.

**Trigger — When an HTTP request is received.** Method `POST`. Leave the request body schema
empty; supplying one forces JSON parsing, and this endpoint receives urlencoded bodies.

### Parse the body

Everything arrives as `application/x-www-form-urlencoded`, from both the scripted flow and
the native no-JavaScript forms, so there is one format to handle.

1. `Compose` → **`raw`**: `string(triggerBody())`

   Run the flow once and check the trigger output. If you see a base64 `$content` wrapper
   rather than the raw string, use `decodeBase64(triggerOutputs()['body']['$content'])`.

2. `Select` → **`pairs`**, From `split(outputs('raw'), '&')`, in key/value mode:
   - key: `first(split(item(), '='))`
   - value: `uriComponentToString(replace(join(skip(split(item(), '='), 1), '='), '+', '%20'))`

   Replacing `+` before decoding, and re-joining on `=`, are both load-bearing — a value
   containing either character is corrupted otherwise. Let the Select build the objects
   rather than concatenating JSON by hand: a reader named O'Brien or D'Angelo will
   otherwise break the parse.

3. `Initialize variable` → **`fields`**, type Object, value `{}`

4. `Apply to each` over `body('pairs')`, **concurrency set to 1**, containing one
   `Set variable`:
   `fields` = `setProperty(variables('fields'), item()['key'], item()['value'])`

Fields are then addressable as `variables('fields')?['first_name']`.

### Validate before writing

The endpoint is public (see *Known traps*), so this step is not optional. A `Condition`
that must pass all of:

- `empty(variables('fields')?['bot-field'])` — the honeypot
- `greater(int(coalesce(variables('fields')?['elapsed_ms'], '0')), 3000)` — nobody fills
  this form in under three seconds
- `less(length(outputs('raw')), 4000)` — payload ceiling
- `form-name` is one of the three known values

On failure, respond `400` and terminate. Do not write the row.

### Branch on `form-name`

- **`contact-lead`** → *Create item* in `Enrollment leads`.
- **`eligibility-result`** → *Get items* filtered `ref eq '<ref>'`, then *Update item* on
  the match, falling back to *Create item* if there is none.

  The fallback matters: a reader who clears storage mid-flow, or whose contact post is
  still queued offline, arrives with a result and no earlier row.
- **`contact-message`** → *Create item* in `Enrollment enquiries`.

Merging the result into the existing row is the improvement over the old Netlify setup,
which could only append. One person becomes one row, and the drop-out follow-up list
becomes a view filtered on `eligible is empty`.

### Notify

When `clinical_review` is `yes`, send mail to the clinical inbox using Send As. Exchange
Online is in scope of the same BAA, so contact details in the body are permissible — but
send the `ref` and a link to the list item instead. One copy of a record is easier to
retain, review, and delete than two.

### Respond

This is where it most often goes wrong.

| Case | Response |
|---|---|
| `redirect_to` is non-empty (no-JavaScript forms) | `302`, `Location: https://enrollment.switzerhealth.com` + the value |
| Otherwise (`fetch` from `flow.js`) | `200`, header `Access-Control-Allow-Origin: https://enrollment.switzerhealth.com` |

Both halves matter.

Without the CORS header, `flow.js` cannot read `res.ok`, every submission looks like a
failure, and leads pile up in `localStorage` while the list stays empty — with the rows
written correctly the whole time, which makes it a memorable afternoon to debug.

And the scripted path must **not** get a 302: `fetch` follows redirects, and the redirected
request then fails CORS.

Validate `redirect_to` as a site-relative path beginning with `/` before building the
`Location` header, or the endpoint becomes an open redirect.

Put the Response action **after** the SharePoint write, not before. Responding early is
faster on bad wifi, but then a failed write returns `200` and the browser discards a lead
it would otherwise have queued and retried.

## 6. Wire up the site

Copy the trigger's HTTP URL into three places, all marked in the code:

1. `assets/config.js` → `intakeEndpoint`
2. `flow.html` → the fallback `<form action>`
3. `contact.html` → the enquiry `<form action>`

Then narrow the CSP in `netlify.toml`: replace `https://*.logic.azure.com` in both
`connect-src` and `form-action` with the exact host the flow was assigned. It does not
change unless the flow is recreated.

## 7. Verify

- Complete the flow with DevTools → Network open. Both POSTs must return **200 with a CORS
  header**, and the bodies must contain contact fields and booleans only — no condition
  names, no insurance value, no home answers.
- Submit with JavaScript disabled. You should land on `/thanks.html`, not on a response
  body.
- Submit `contact.html`. Same.
- Confirm **one row per person** in the list, with the result merged into the contact row.
- Submit twice quickly to confirm the `elapsed_ms` guard rejects the fast one.

## 8. Hand over

- Add **two named humans as co-owners** of the flow. They can edit, read run history, and
  receive failure notifications without ever touching the vault.
- **Forward the service account's mailbox to a monitored address.** Power Automate sends
  failure mail to the flow owner, and the flow owner is now an inbox nobody opens.
- In the Proton Pass vault alongside the credentials, write down:

  > Changing this account's password, or tightening Conditional Access on it, can
  > invalidate the flow's connections and stop enrollment submissions with no visible
  > error. Test a submission after any such change.

  That note is worth more than the rest of this document in eighteen months.

---

## Known traps

**The endpoint URL is public.** A static site cannot hold a credential, so the trigger's
`sig=` signature ships in readable JavaScript. It is write-only and returns nothing, but
anyone can POST to it — which is why §5's validation step exists. If it is ever abused,
edit and re-save the trigger to regenerate the signature, then update the three places in
§6.

**Vault membership is the real access control.** Anyone in the Proton Pass shared vault can
sign in as the automation identity. Keep it to two or three people and treat adding someone
as an access decision, not a convenience.

**The queue holds submissions on the reader's device.** Failed posts sit in `localStorage`
until they flush. On a shared conference tablet that is a copy of someone's contact details
on hardware you do not control. The BAA does not reach it. This is disclosed in
`privacy.html`.

**`clinical_review = yes` next to a name is health information about an identified person.**
Moving it under the BAA fixes where it is stored. It is not a reason to treat the record as
low-sensitivity now that it lives somewhere better.

**Licensing has one gray area worth five minutes with your reseller.** Per-user Premium
licenses the flow's *owner*, and anonymous callers hitting an HTTP trigger need no license.
That is the standard reading and how these are normally built, but Microsoft's multiplexing
rules are aggressive enough to be worth confirming — the alternative answer is $150/month
rather than $15.

**A single automation account is a blast radius.** Fine at this size. Revisit if you add a
flow touching materially more sensitive data than this one.
