/* ============================================================================
   SwitzerHealth — Question definitions

   Single source of truth for the eligibility flow. Edit copy here, not in
   flow.js.

   PRIVACY: every question in this file except `contact` is answered and scored
   entirely in the browser. None of these answers is transmitted, stored, or
   logged. Only the derived booleans leave the page. If you add a question here,
   it inherits that property automatically — the transmit layer in flow.js has
   an explicit allow-list and ignores everything else.

   Copy that changes depending on who is filling the form is written as
   { self: "...", other: "..." } and resolved by `pick()` in flow.js.
   ========================================================================= */

/* Questions asked after the contact step. The contact step itself is rendered
   by hand in flow.js because its validation is bespoke. */
const QUESTIONS = [
  {
    id: 'who',
    type: 'single',
    legend: 'Who are you signing up for?',
    help: 'This just helps us word the rest of the questions.',
    options: [
      { value: 'self', label: 'Myself' },
      { value: 'other', label: 'Someone I care for', note: 'A parent, spouse, or someone else' }
    ]
  },

  { id: 'contact', type: 'contact' },

  {
    id: 'age',
    type: 'single',
    legend: {
      self: 'Are you 65 or older?',
      other: 'Is the person you care for 65 or older?'
    },
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' }
    ]
  },

  {
    id: 'insurance',
    type: 'single',
    legend: {
      self: 'What kind of health insurance do you have?',
      other: 'What kind of health insurance do they have?'
    },
    help: 'Monitoring is usually billed to Medicare. Pick the closest answer — our team will confirm the details with you.',
    options: [
      { value: 'partb', label: 'Original Medicare', note: 'Part A and Part B, often with a red, white, and blue card' },
      { value: 'advantage', label: 'Medicare Advantage', note: 'A Medicare plan through a private company' },
      { value: 'commercial', label: 'Insurance through work or a private plan' },
      { value: 'va', label: 'VA or TRICARE' },
      { value: 'none', label: 'No insurance right now' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  {
    id: 'conditions',
    type: 'multi',
    legend: {
      self: 'Has a doctor told you that you have any of these?',
      other: 'Has a doctor told them they have any of these?'
    },
    help: 'Choose as many as apply. Medicare asks that monitoring be tied to an ongoing health condition.',
    options: [
      { value: 'chf', label: 'Heart failure' },
      { value: 'copd', label: 'COPD, emphysema, or another breathing problem' },
      { value: 'htn', label: 'High blood pressure' },
      { value: 'diabetes', label: 'Diabetes' },
      { value: 'afib', label: 'Atrial fibrillation or an irregular heartbeat' },
      { value: 'ckd', label: 'Kidney disease' },
      { value: 'dementia', label: 'Dementia or memory problems' },
      { value: 'sleepapnea', label: 'Sleep apnea' },
      { value: 'other', label: 'Something else ongoing' },
      { value: 'none', label: 'None of these', exclusive: true },
      { value: 'notsure', label: "I'm not sure", exclusive: true }
    ]
  },

  {
    id: 'hospital',
    type: 'single',
    legend: {
      self: 'Have you stayed in a hospital or visited an emergency room in the last year?',
      other: 'Have they stayed in a hospital or visited an emergency room in the last year?'
    },
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  {
    id: 'doctor',
    type: 'single',
    legend: {
      self: 'Do you have a doctor you have seen in the last three years?',
      other: 'Do they have a doctor they have seen in the last three years?'
    },
    help: 'Medicare requires an existing relationship with a doctor before monitoring can start. If there is not one, we can help arrange a first visit.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  /* --- Home readiness ------------------------------------------------------
     These four come straight from what the XK300 sensor physically needs:
     a network connection, mains power near the bed, a wall it can be fixed to
     with a clear line of sight to the sleeper, and enough nights in the same
     bed to produce usable data. */
  {
    id: 'wifi',
    type: 'single',
    legend: {
      self: 'Do you have internet or Wi-Fi where you sleep?',
      other: 'Do they have internet or Wi-Fi where they sleep?'
    },
    help: 'If not, do not worry — we have a version of the sensor that uses a cellular signal instead, at no extra cost.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  {
    id: 'outlet',
    type: 'single',
    legend: {
      self: 'Is there a power outlet near where you sleep?',
      other: 'Is there a power outlet near where they sleep?'
    },
    help: 'The sensor plugs into a normal wall outlet. It needs one within about ten feet of the bed.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  {
    id: 'wall',
    type: 'single',
    legend: {
      self: 'Could something the size of a small book be attached to the wall, where it can "see" the bed?',
      other: 'Could something the size of a small book be attached to the wall, where it can "see" the bed?'
    },
    help: 'It mounts on the wall or sits on a shelf, usually facing the bed from the side or the foot. Nothing tall — a wardrobe, a folding screen, a stack of boxes — can block the space between it and the bed.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  },

  {
    id: 'nights',
    type: 'single',
    legend: {
      self: 'Do you sleep in the same bed at least 16 nights a month?',
      other: 'Do they sleep in the same bed at least 16 nights a month?'
    },
    help: 'Medicare looks at how many nights of readings we can collect. Fewer nights may still work — it just changes how the monitoring is billed.',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No', note: 'For example, splitting time between two homes' },
      { value: 'notsure', label: "I'm not sure" }
    ]
  }
];

/* Real medical conditions, as opposed to the two exclusive escape hatches. */
const REAL_CONDITIONS = [
  'chf', 'copd', 'htn', 'diabetes', 'afib', 'ckd', 'dementia', 'sleepapnea', 'other'
];

/* ---------------------------------------------------------------------------
   Scoring.

   Returns { tier, eligible, clinicalReview, reasons } where `reasons` is used
   ONLY to write the on-screen explanation. Reasons are never transmitted —
   that asymmetry is the whole design: the reader gets a specific, useful
   answer while the stored record stays a bare boolean.

   Tiers:
     'eligible'  — everything lines up. Flag for a clinical call.
     'review'    — workable, but something needs a human. Flag for a call too.
     'not-fit'   — a genuine blocker today. Still saved, still offered contact.
   ------------------------------------------------------------------------ */
function scoreAnswers(a) {
  const reasons = [];
  const conditions = a.conditions || [];
  const hasCondition = conditions.some((c) => REAL_CONDITIONS.includes(c));

  /* Hard install blockers. The sensor cannot work without these two, and
     saying so plainly is kinder than a call that ends the same way. */
  if (a.outlet === 'no') {
    reasons.push('The sensor needs to plug into an outlet near the bed.');
  }
  if (a.wall === 'no') {
    reasons.push('The sensor needs a clear view of the bed from a wall or shelf.');
  }
  if (reasons.length) {
    return { tier: 'not-fit', eligible: false, clinicalReview: false, reasons };
  }

  /* No ongoing condition and no recent hospital care means there is nothing
     for Medicare to tie monitoring to yet. Not a permanent no. */
  if (conditions.includes('none') && a.hospital === 'no') {
    return {
      tier: 'not-fit',
      eligible: false,
      clinicalReview: false,
      reasons: ['Medicare ties this kind of monitoring to an ongoing health condition, and it sounds like there is not one right now.']
    };
  }

  /* Everything below is workable but wants a human on the phone. */
  if (a.outlet === 'notsure') {
    reasons.push('We should check together whether there is an outlet near the bed.');
  }
  if (a.wall === 'notsure') {
    reasons.push('We should check together where the sensor could go in the bedroom.');
  }
  if (a.wifi === 'no') {
    reasons.push('Without Wi-Fi we would send the cellular version of the sensor instead.');
  }
  if (a.wifi === 'notsure') {
    reasons.push('We can sort out the internet question on the phone.');
  }
  if (a.nights === 'no' || a.nights === 'notsure') {
    reasons.push('Sleeping in more than one place is fine — it changes how the monitoring is billed, not whether it works.');
  }
  if (!hasCondition && conditions.includes('notsure')) {
    reasons.push('Our clinical team will go over your health history with you.');
  }
  if (a.doctor === 'no') {
    reasons.push('A doctor needs to order the monitoring. We can help arrange a first visit.');
  }
  if (a.doctor === 'notsure') {
    reasons.push('We will confirm which doctor can order the monitoring.');
  }
  if (a.insurance === 'none') {
    reasons.push('Coverage is the piece to work out — we will talk through the options.');
  }
  if (a.insurance === 'notsure' || a.insurance === 'commercial' || a.insurance === 'va') {
    reasons.push('We will confirm what your plan covers before anything is set up.');
  }

  if (reasons.length) {
    return { tier: 'review', eligible: false, clinicalReview: true, reasons };
  }

  return { tier: 'eligible', eligible: true, clinicalReview: true, reasons: [] };
}
