/* ============================================================================
   SwitzerHealth — deployment configuration

   The one file to edit when the intake endpoint changes. Loaded before
   flow.js; no build step, no bundler.

   ---------------------------------------------------------------------------
   THE ENDPOINT URL IS PUBLIC. TREAT IT AS WRITE-ONLY.

   A static site cannot hold a Microsoft credential — anything shipped to the
   browser can be read by anyone who views source. The Power Automate trigger
   URL carries its own `sig=` shared-access signature, so publishing it here
   means anyone can POST to the flow.

   That is acceptable only because the endpoint is write-only: it accepts a
   submission and returns nothing. It cannot read the list, and it cannot be
   replayed into anything else. What it CAN do is accept junk, so the flow
   itself has to validate (see the "Anti-abuse" section of the README).

   If the URL is ever abused, regenerate it in Power Automate (edit the trigger
   and save — the signature changes) and update the three places it appears:

     1. this file                     — the scripted flow
     2. flow.html    `<form action>`  — the no-JavaScript fallback
     3. contact.html `<form action>`  — the general enquiry form

   Nothing else needs to change.
   ------------------------------------------------------------------------ */
window.SWH_CONFIG = {
  /* Power Automate → "When an HTTP request is received" → HTTP URL.
     Looks like:
     https://prod-NN.westus.logic.azure.com:443/workflows/.../invoke?api-version=2016-06-01&sp=...&sv=1.0&sig=...

     Left empty on purpose so an unconfigured deploy fails loudly in the
     console instead of silently dropping leads. Submissions made while it is
     empty are parked in localStorage and flush once it is set. */
  intakeEndpoint: ''
};
