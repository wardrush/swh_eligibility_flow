/* ============================================================================
   SwitzerHealth — Eligibility flow

   Depends on questions.js (QUESTIONS, scoreAnswers).

   ---------------------------------------------------------------------------
   THE PRIVACY BOUNDARY

   `TRANSMIT_FIELDS` below is an explicit allow-list. `postForm()` drops every
   key that is not in it, so a health answer cannot reach the network even if
   someone later passes the whole answer object by mistake. There is no code
   path that serializes `state.answers`.

   To verify: open DevTools -> Network, complete the flow, inspect the two POST
   bodies. They must contain contact fields and booleans only.
   ------------------------------------------------------------------------ */
(function () {
  'use strict';

  var FORM_CONTACT = 'contact-lead';
  var FORM_RESULT = 'eligibility-result';
  var QUEUE_KEY = 'swh.queue';
  var REF_KEY = 'swh.ref';

  var TRANSMIT_FIELDS = [
    'form-name',
    'ref',
    'first_name',
    'last_name',
    'email',
    'phone',
    'zip',
    'preferred_contact',
    'contact_optin',
    'signing_up_for',
    'source',
    'consent_text',
    'submitted_at',
    'eligible',
    'clinical_review'
  ];

  var CONSENT_TEXT =
    'I understand SwitzerHealth will save my contact information so someone can follow up with me.';
  var OPTIN_TEXT =
    'Yes, SwitzerHealth may call or text me about signing up.';

  /* --- State -------------------------------------------------------------- */
  var state = {
    index: 0,
    answers: {},
    contact: {},
    ref: null,
    contactPosted: false,
    source: '',
    result: null
  };

  var els = {};

  /* --- Small helpers ------------------------------------------------------ */

  /* Resolve copy that varies by who is filling the form. */
  function pick(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return value[state.answers.who === 'other' ? 'other' : 'self'] || value.self || '';
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function makeRef() {
    try {
      if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID().split('-')[0].toUpperCase();
      }
    } catch (e) { /* fall through */ }
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function load(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* --- Network -------------------------------------------------------------
     Netlify Forms accepts a urlencoded POST to any path on the site as long as
     `form-name` matches a form it discovered in the deployed HTML. */

  function encode(data) {
    var params = new URLSearchParams();
    TRANSMIT_FIELDS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key) && data[key] != null) {
        params.append(key, String(data[key]));
      }
    });
    return params.toString();
  }

  function readQueue() {
    try { return JSON.parse(load(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }

  function writeQueue(q) {
    store(QUEUE_KEY, JSON.stringify(q));
  }

  /* Conference wifi drops constantly. A failed submission is parked in
     localStorage and retried on the next page load or when the browser comes
     back online, so a lead is not lost to a dead hotspot. */
  function enqueue(body) {
    var q = readQueue();
    q.push(body);
    writeQueue(q);
  }

  function send(body) {
    return fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    });
  }

  function postForm(formName, data) {
    data['form-name'] = formName;
    data.submitted_at = new Date().toISOString();
    var body = encode(data);

    return send(body)['catch'](function () {
      return send(body); // one immediate retry — most failures are transient
    })['catch'](function () {
      enqueue(body);
      return null;
    });
  }

  function flushQueue() {
    var q = readQueue();
    if (!q.length) return;
    writeQueue([]);
    q.forEach(function (body) {
      send(body)['catch'](function () { enqueue(body); });
    });
  }

  /* --- Rendering ---------------------------------------------------------- */

  function setProgress() {
    var total = QUESTIONS.length;
    var current = Math.min(state.index + 1, total);
    if (state.result) {
      els.progressText.textContent = 'Finished';
      els.progressFill.style.width = '100%';
    } else {
      els.progressText.textContent = 'Question ' + current + ' of ' + total;
      els.progressFill.style.width = Math.round((current / total) * 100) + '%';
    }
  }

  function showError(message) {
    els.error.textContent = '';
    els.error.appendChild(document.createTextNode(message));
    els.error.hidden = false;
    els.error.focus();
  }

  function clearError() {
    els.error.hidden = true;
    els.error.textContent = '';
  }

  /* Move focus to the new question so screen-reader and keyboard users land in
     the right place instead of at the top of the document. */
  function focusStep() {
    var target = els.step.querySelector('[data-focus]');
    if (target) target.focus();
    window.scrollTo(0, 0);
  }

  function renderChoices(q) {
    var wrap = el('div', { class: 'choices' });
    var isMulti = q.type === 'multi';
    var selected = state.answers[q.id];

    q.options.forEach(function (opt, i) {
      var input = el('input', {
        type: isMulti ? 'checkbox' : 'radio',
        name: q.id,
        value: opt.value,
        id: q.id + '-' + opt.value
      });

      if (isMulti) {
        input.checked = Array.isArray(selected) && selected.indexOf(opt.value) !== -1;
      } else {
        input.checked = selected === opt.value;
      }

      if (i === 0) input.setAttribute('data-focus', '');

      var labelText = el('span', { class: 'choice__label', text: opt.label });
      if (opt.note) {
        labelText.appendChild(el('span', { class: 'choice__note', text: opt.note }));
      }

      var card = el('label', { class: 'choice' }, [
        input,
        el('span', { class: 'choice__box', 'aria-hidden': 'true' }),
        labelText
      ]);

      /* Selecting an answer never advances the screen on its own. The reader
         chooses, sees the choice register, and then presses Next. */
      input.addEventListener('change', function () {
        clearError();
        if (isMulti) {
          var current = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
          if (input.checked) {
            /* "None of these" and "I'm not sure" clear the rest, and any real
               answer clears them. */
            if (opt.exclusive) {
              current = [opt.value];
            } else {
              current = current.filter(function (v) {
                var o = q.options.filter(function (x) { return x.value === v; })[0];
                return o && !o.exclusive;
              });
              current.push(opt.value);
            }
          } else {
            current = current.filter(function (v) { return v !== opt.value; });
          }
          state.answers[q.id] = current;
          syncMulti(wrap, q, current);
        } else {
          state.answers[q.id] = opt.value;
        }
      });

      wrap.appendChild(card);
    });

    return wrap;
  }

  function syncMulti(wrap, q, current) {
    q.options.forEach(function (opt) {
      var input = wrap.querySelector('#' + CSS.escape(q.id + '-' + opt.value));
      if (input) input.checked = current.indexOf(opt.value) !== -1;
    });
  }

  function renderContactStep() {
    var c = state.contact;

    function field(id, label, hint, attrs) {
      var input = el('input', Object.assign({ id: id, name: id, value: c[id] || '' }, attrs));
      var wrap = el('div', { class: 'field', id: 'field-' + id }, [
        el('label', { class: 'field__label', for: id, text: label }),
        hint ? el('span', { class: 'field__hint', text: hint }) : null,
        input
      ]);
      input.addEventListener('input', function () {
        c[id] = input.value;
        clearError();
        wrap.classList.remove('field--invalid');
      });
      return wrap;
    }

    var fs = el('fieldset', {}, [
      el('legend', { tabindex: '-1', 'data-focus': '', text: 'How can we reach you?' })
    ]);

    fs.appendChild(el('p', {
      class: 'step__help',
      text: 'You only need to give us one way to reach you — an email address or a phone number. Whichever is easier.'
    }));

    fs.appendChild(field('first_name', 'First name', null, { type: 'text', autocomplete: 'given-name' }));
    fs.appendChild(field('last_name', 'Last name', null, { type: 'text', autocomplete: 'family-name' }));
    fs.appendChild(field('email', 'Email address', 'Leave blank if you do not use email.', {
      type: 'email', autocomplete: 'email', inputmode: 'email'
    }));
    fs.appendChild(field('phone', 'Phone number', 'Leave blank if you would rather not give one.', {
      type: 'tel', autocomplete: 'tel', inputmode: 'tel'
    }));
    fs.appendChild(field('zip', 'ZIP code', 'So we know which team covers your area.', {
      type: 'text', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: '10'
    }));

    /* Required acknowledgement — saving happens either way, and we say so. */
    var ack = el('input', { type: 'checkbox', id: 'ack' });
    ack.checked = !!c.ack;
    ack.addEventListener('change', function () { c.ack = ack.checked; clearError(); });
    fs.appendChild(el('label', { class: 'consent', for: 'ack' }, [
      ack,
      el('span', { class: 'consent__required', text: CONSENT_TEXT })
    ]));

    /* Optional, unchecked by default. Declining does not block the flow. */
    var optin = el('input', { type: 'checkbox', id: 'optin' });
    optin.checked = !!c.optin;
    optin.addEventListener('change', function () { c.optin = optin.checked; });
    fs.appendChild(el('label', { class: 'consent', for: 'optin' }, [
      optin,
      el('span', { text: OPTIN_TEXT + ' (Optional — you can still finish without this.)' })
    ]));

    return fs;
  }

  function validateContact() {
    var c = state.contact;
    var email = (c.email || '').trim();
    var phone = (c.phone || '').trim();

    if (!(c.first_name || '').trim()) {
      markInvalid('first_name');
      return 'Please tell us your first name so we know who we are talking to.';
    }
    if (!email && !phone) {
      markInvalid('email');
      markInvalid('phone');
      return 'We need either an email address or a phone number so we can reach you. Just one is enough.';
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      markInvalid('email');
      return 'That email address does not look complete. Please check it, or leave it blank and give us a phone number instead.';
    }
    if (phone && phone.replace(/\D/g, '').length < 10) {
      markInvalid('phone');
      return 'That phone number looks too short. Please include the area code, or leave it blank and give us an email instead.';
    }
    if (!c.ack) {
      return 'Please check the box confirming you understand we will save your contact information.';
    }
    return null;
  }

  function markInvalid(id) {
    var f = document.getElementById('field-' + id);
    if (f) f.classList.add('field--invalid');
  }

  function renderQuestion(q) {
    var fs = el('fieldset', {}, [
      el('legend', { tabindex: '-1', 'data-focus': '', text: pick(q.legend) })
    ]);
    if (q.help) {
      fs.appendChild(el('p', { class: 'step__help', text: pick(q.help) }));
    }
    fs.appendChild(renderChoices(q));
    return fs;
  }

  function render() {
    clearError();
    els.step.textContent = '';

    if (state.result) {
      renderResult();
      setProgress();
      focusStep();
      return;
    }

    var q = QUESTIONS[state.index];
    els.step.appendChild(q.type === 'contact' ? renderContactStep() : renderQuestion(q));

    els.back.style.visibility = state.index === 0 ? 'hidden' : 'visible';
    els.next.textContent = state.index === QUESTIONS.length - 1 ? 'See my result' : 'Next';
    els.nav.hidden = false;

    setProgress();
    focusStep();
  }

  /* --- Result --------------------------------------------------------------
     The on-screen explanation can be as specific as it likes, because it is
     rendered from `state.answers` locally. Only the booleans are posted. */
  function renderResult() {
    els.nav.hidden = true;
    var r = state.result;
    var optedIn = !!state.contact.optin;
    var name = (state.contact.first_name || '').trim();

    var panelClass = r.tier === 'not-fit' ? 'panel' : (r.tier === 'eligible' ? 'panel panel--go' : 'panel panel--review');
    var heading;
    var lead;

    if (r.tier === 'eligible') {
      heading = 'Good news — this looks like a fit.';
      lead = 'Everything you told us points the right way. The last step is a short call with our clinical team to confirm what Medicare requires.';
    } else if (r.tier === 'review') {
      heading = 'You are most likely a fit — we just need to check a couple of things.';
      lead = 'Nothing you told us rules this out. A few answers need a person rather than a website, which is what the call is for.';
    } else {
      heading = 'This is not the right fit today.';
      lead = 'Based on your answers, the monitoring would not work well right now. That can change, and we are happy to stay in touch.';
    }

    var body = el('div', { class: panelClass });
    body.appendChild(el('h2', {
      class: 'result__headline',
      tabindex: '-1',
      'data-focus': '',
      text: name ? heading.replace('Good news', 'Good news, ' + name) : heading
    }));
    body.appendChild(el('p', { text: lead }));

    if (r.reasons.length) {
      var ul = el('ul');
      r.reasons.forEach(function (reason) {
        ul.appendChild(el('li', { text: reason }));
      });
      body.appendChild(ul);
    }
    els.step.appendChild(body);

    /* What happens next depends entirely on whether they said we may call. */
    var next = el('div', { style: 'margin-top: var(--sp-5)' });
    if (r.clinicalReview && optedIn) {
      next.appendChild(el('h3', { text: 'What happens next' }));
      var ol = el('ol', { class: 'next-steps' }, [
        el('li', { html: '<strong>We have your details.</strong> They were saved when you filled them in.' }),
        el('li', { html: '<strong>Our clinical team will reach out</strong> within two business days.' }),
        el('li', { html: '<strong>They confirm eligibility with you</strong> and answer whatever you want to ask.' })
      ]);
      next.appendChild(ol);
    } else if (r.clinicalReview && !optedIn) {
      next.appendChild(el('h3', { text: 'What happens next' }));
      next.appendChild(el('p', {
        text: 'You did not ask us to call, so we will not. When you are ready, reach us whenever you like — there is no time limit and nothing expires.'
      }));
    } else {
      next.appendChild(el('h3', { text: 'If anything changes' }));
      next.appendChild(el('p', {
        text: 'Health and living situations change. If yours does, get in touch and we will take another look.'
      }));
    }

    next.appendChild(el('p', {
      html: 'Call <a href="tel:+18015550142">(801) 555-0142</a> or email ' +
            '<a href="mailto:hello@switzerhealth.com">hello@switzerhealth.com</a>.'
    }));
    next.appendChild(el('p', {}, [
      el('a', { class: 'btn btn--secondary', href: '/contact.html', text: 'Send us a message' })
    ]));

    if (state.ref) {
      next.appendChild(el('p', {
        class: 'citations',
        text: 'Your reference number is ' + state.ref + '. Mention it if you call and we will find you faster.'
      }));
    }

    next.appendChild(el('div', {
      class: 'emergency',
      style: 'margin-top: var(--sp-4)',
      text: 'This service does not replace emergency care. In an emergency, call 911.'
    }));

    next.appendChild(el('p', {
      class: 'disclaimer',
      style: 'margin-top: var(--sp-4)',
      text: 'Reimbursement depends on valid physician orders, qualifying diagnoses, and individualized patient assessment. Not all patients qualify. Care management codes are mutually exclusive. Coverage varies by payer mix and setting.'
    }));

    els.step.appendChild(next);
  }

  /* --- Navigation --------------------------------------------------------- */

  function currentAnswered() {
    var q = QUESTIONS[state.index];
    if (q.type === 'contact') return true;
    var v = state.answers[q.id];
    if (q.type === 'multi') return Array.isArray(v) && v.length > 0;
    return !!v;
  }

  function goNext() {
    var q = QUESTIONS[state.index];

    if (q.type === 'contact') {
      var problem = validateContact();
      if (problem) { showError(problem); return; }
      submitContact();
    } else if (!currentAnswered()) {
      showError(
        q.type === 'multi'
          ? 'Please choose at least one answer. If none of them apply, choose "None of these".'
          : 'Please choose one of the answers to continue.'
      );
      return;
    }

    if (state.index === QUESTIONS.length - 1) {
      finish();
      return;
    }

    state.index += 1;
    render();
  }

  function goBack() {
    if (state.result) {
      state.result = null;
      state.index = QUESTIONS.length - 1;
      render();
      return;
    }
    if (state.index > 0) {
      state.index -= 1;
      render();
    }
  }

  /* Fires the moment the contact screen is completed — the "save it as soon as
     we have it" requirement. Runs once; later edits do not re-post. */
  function submitContact() {
    if (state.contactPosted) return;
    state.contactPosted = true;

    var c = state.contact;
    postForm(FORM_CONTACT, {
      ref: state.ref,
      first_name: (c.first_name || '').trim(),
      last_name: (c.last_name || '').trim(),
      email: (c.email || '').trim(),
      phone: (c.phone || '').trim(),
      zip: (c.zip || '').trim(),
      preferred_contact: (c.email || '').trim() && (c.phone || '').trim()
        ? 'either'
        : ((c.email || '').trim() ? 'email' : 'phone'),
      contact_optin: c.optin ? 'yes' : 'no',
      signing_up_for: state.answers.who === 'other' ? 'loved-one' : 'self',
      source: state.source,
      consent_text: CONSENT_TEXT + (c.optin ? ' | ' + OPTIN_TEXT : '')
    });
  }

  function finish() {
    state.result = scoreAnswers(state.answers);

    postForm(FORM_RESULT, {
      ref: state.ref,
      first_name: (state.contact.first_name || '').trim(),
      last_name: (state.contact.last_name || '').trim(),
      email: (state.contact.email || '').trim(),
      phone: (state.contact.phone || '').trim(),
      contact_optin: state.contact.optin ? 'yes' : 'no',
      source: state.source,
      eligible: state.result.eligible ? 'true' : 'false',
      clinical_review: state.result.clinicalReview ? 'yes' : 'no'
    });

    render();
  }

  /* --- Boot --------------------------------------------------------------- */
  function init() {
    els.step = document.getElementById('step');
    els.error = document.getElementById('flow-error');
    els.nav = document.getElementById('flow-nav');
    els.back = document.getElementById('flow-back');
    els.next = document.getElementById('flow-next');
    els.progressText = document.getElementById('progress-text');
    els.progressFill = document.getElementById('progress-fill');

    if (!els.step) return;

    /* Reveal the scripted flow and retire the no-JS fallback form. */
    document.getElementById('flow-app').hidden = false;
    var fallback = document.getElementById('fallback');
    if (fallback) fallback.hidden = true;

    state.ref = load(REF_KEY) || makeRef();
    store(REF_KEY, state.ref);

    var params = new URLSearchParams(window.location.search);
    state.source = params.get('src') || params.get('utm_source') || 'direct';

    els.next.addEventListener('click', goNext);
    els.back.addEventListener('click', goBack);

    /* Enter submits the step rather than reloading the page. */
    els.step.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        e.preventDefault();
        goNext();
      }
    });

    flushQueue();
    window.addEventListener('online', flushQueue);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
