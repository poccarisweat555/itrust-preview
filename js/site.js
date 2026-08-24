/* =========================================================================
   iTrust site behaviour. No dependencies.
   - mobile navigation drawer (keyboard accessible, focus-trapped)
   - scroll reveal (skipped entirely under prefers-reduced-motion)
   - analytics dispatch for [data-track] elements
   - demo request form: validation, loading, error, success states
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- Analytics -------------------------------------------------------- */
  function emit(event, params) {
    if (!event) return;
    var payload = params || {};
    try {
      if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: event }, payload));
      if (typeof window.gtag === 'function') window.gtag('event', event, payload);
      document.dispatchEvent(new CustomEvent('itrust:analytics', { detail: { event: event, params: payload } }));
    } catch (err) { /* analytics must never break the page */ }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;
    emit(el.getAttribute('data-track'), {
      label: el.getAttribute('data-track-label') || (el.textContent || '').trim().slice(0, 80),
      page_path: window.location.pathname
    });
  });

  document.querySelectorAll('details[data-track]').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) emit(d.getAttribute('data-track'), { label: d.getAttribute('data-track-label') || '' });
    });
  });

  /* --- Mobile drawer ---------------------------------------------------- */
  (function drawer() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var panel = document.querySelector('[data-nav-drawer]');
    if (!toggle || !panel) return;

    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    var open = false;

    function setOpen(next) {
      open = next;
      toggle.setAttribute('aria-expanded', String(next));
      panel.setAttribute('data-open', String(next));
      document.body.setAttribute('data-nav-open', String(next));
      if (next) {
        panel.removeAttribute('hidden');
        // Wait one frame so the panel is visible before focus moves into it.
        window.requestAnimationFrame(function () {
          if (!open) return;
          var first = panel.querySelector(FOCUSABLE);
          if (first) first.focus();
        });
      } else {
        // Keep the panel in the a11y tree only while open.
        var hide = function () { if (!open) panel.setAttribute('hidden', ''); };
        reduceMotion.matches ? hide() : window.setTimeout(hide, 220);
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(!open);
      if (!open) toggle.focus();
    });

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); toggle.focus(); return; }
      if (e.key !== 'Tab') return;
      var items = Array.prototype.slice.call(panel.querySelectorAll(FOCUSABLE))
        .filter(function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      // Trap focus inside the drawer, including the toggle itself.
      if (e.shiftKey && (document.activeElement === first || document.activeElement === toggle)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); toggle.focus();
      }
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (ev) {
      if (ev.matches && open) setOpen(false);
    });
  })();

  /* --- Scroll reveal ---------------------------------------------------- */
  (function reveal() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    function showAll() {
      items.forEach(function (el) { el.setAttribute('data-revealed', 'true'); });
    }
    if (reduceMotion.matches || !('IntersectionObserver' in window)) { showAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-revealed', 'true');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
    // If the user turns reduced motion on mid-session, stop animating.
    reduceMotion.addEventListener('change', function (ev) { if (ev.matches) { io.disconnect(); showAll(); } });
  })();

  /* --- Async forms (demo request, partner application) ------------------ */
  (function asyncForms() {
    document.querySelectorAll('[data-async-form]').forEach(setUpForm);
  })();

  function setUpForm(form) {
    var cfg = {};
    try { cfg = JSON.parse(form.getAttribute('data-config') || '{}'); } catch (e) { cfg = {}; }
    var summary = form.querySelector('[data-error-summary]');
    var summaryList = summary && summary.querySelector('ol');
    var banner = form.querySelector('[data-form-banner]');
    var successId = form.getAttribute('data-success');
    var success = successId ? document.getElementById(successId) : null;
    var submit = form.querySelector('[data-submit]');
    var started = false;

    var EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
    // A bare domain is accepted; the protocol is added on submit rather than
    // rejecting input people reasonably type.
    var URL_LIKE = /^(https?:\/\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?(\/[^\s]*)?$/i;
    // Consumer domains are allowed through: this only nudges toward a work address.
    function validate(el) {
      var value = (el.value || '').trim();
      var required = el.hasAttribute('required');
      if (el.type === 'radio') {
        // Required-ness is declared on the first radio; the group satisfies it.
        if (!required) return '';
        var group = form.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
        for (var i = 0; i < group.length; i++) if (group[i].checked) return '';
        return el.getAttribute('data-msg-required') || 'Select an option.';
      }
      if (el.type === 'checkbox') return el.checked || !required ? '' : el.getAttribute('data-msg-required') || 'This field is required.';
      if (required && !value) return el.getAttribute('data-msg-required') || 'This field is required.';
      if (!value) return '';
      if (el.type === 'email' && !EMAIL.test(value)) return el.getAttribute('data-msg-type') || 'Enter a valid email address.';
      if (el.type === 'url' && !URL_LIKE.test(value)) return el.getAttribute('data-msg-type') || 'Enter a valid website address.';
      if (el.name === 'phone' && !/^[\d\s()+.\-]{7,}$/.test(value)) return el.getAttribute('data-msg-type') || 'Enter a valid phone number.';
      if (el.minLength > 0 && value.length < el.minLength) return 'Use at least ' + el.minLength + ' characters.';
      return '';
    }

    function fieldOf(el) { return el.closest('.field'); }

    function setError(el, message) {
      var field = fieldOf(el);
      if (!field) return;
      var out = field.querySelector('[data-error-for]');
      field.classList.toggle('field--error', Boolean(message));
      if (el.type === 'radio') {
        form.querySelectorAll('input[type="radio"][name="' + el.name + '"]')
          .forEach(function (r) { r.setAttribute('aria-invalid', message ? 'true' : 'false'); });
      } else {
        el.setAttribute('aria-invalid', message ? 'true' : 'false');
      }
      if (out) out.querySelector('span').textContent = message || '';
    }

    var controls = Array.prototype.slice.call(
      form.querySelectorAll('input[name], select[name], textarea[name]')
    ).filter(function (el) { return el.type !== 'hidden'; });

    controls.forEach(function (el) {
      // Validate on blur, not on keystroke.
      el.addEventListener('blur', function () { if (el.value || el.hasAttribute('required')) setError(el, validate(el)); });
      // Clear an existing error as soon as the user corrects the field.
      el.addEventListener('input', function () {
        if (fieldOf(el) && fieldOf(el).classList.contains('field--error') && !validate(el)) setError(el, '');
        if (!started) { started = true; emit(cfg.events && cfg.events.formStart); }
      });
      el.addEventListener('change', function () {
        if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') {
          setError(el, validate(el));
        }
      });
    });

    function showSummary(errors) {
      if (!summary || !summaryList) return;
      summaryList.innerHTML = '';
      errors.forEach(function (item) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + item.id;
        a.textContent = item.label + ' — ' + item.message;
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          var target = document.getElementById(item.id);
          if (target) target.focus();
        });
        li.appendChild(a);
        summaryList.appendChild(li);
      });
      summary.setAttribute('data-visible', 'true');
      summary.focus();
    }

    function hideSummary() { if (summary) summary.setAttribute('data-visible', 'false'); }
    function setBanner(visible, html) {
      if (!banner) return;
      if (html) banner.querySelector('[data-banner-text]').innerHTML = html;
      banner.setAttribute('data-visible', visible ? 'true' : 'false');
    }
    function setLoading(state) {
      if (!submit) return;
      submit.setAttribute('data-loading', String(state));
      submit.disabled = state;
      submit.setAttribute('aria-busy', String(state));
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideSummary();
      setBanner(false);

      var errors = [];
      var seenRadioGroups = {};
      controls.forEach(function (el) {
        // A radio group produces at most one error, not one per option.
        if (el.type === 'radio') {
          if (seenRadioGroups[el.name]) return;
          seenRadioGroups[el.name] = true;
        }
        var message = validate(el);
        setError(el, message);
        if (message) {
          // Long consent-style labels get an explicit short name for the summary.
          var explicit = el.getAttribute('data-summary-label');
          var label = form.querySelector('label[for="' + el.id + '"]');
          errors.push({
            id: el.id,
            label: explicit || (label
              ? label.textContent.replace(/\s*\*\s*$/, '').replace(/\s*\(optional\)\s*/i, '').trim()
              : el.name),
            message: message
          });
        }
      });

      if (errors.length) {
        // One error -> focus the field. Several -> focus the linked summary.
        if (errors.length === 1) {
          var only = document.getElementById(errors[0].id);
          if (only) only.focus();
        } else {
          showSummary(errors);
        }
        emit(cfg.events && cfg.events.formError, { reason: 'validation', fields: errors.length });
        return;
      }

      emit(cfg.events && cfg.events.formSubmit);
      setLoading(true);

      // Normalise URL fields so the submitted value is always absolute.
      form.querySelectorAll('input[type="url"]').forEach(function (el) {
        var v = (el.value || '').trim();
        if (v && !/^https?:\/\//i.test(v)) el.value = 'https://' + v;
      });

      var data = new FormData(form);
      var finish = function () {
        setLoading(false);
        form.setAttribute('hidden', '');
        if (success) {
          success.setAttribute('data-visible', 'true');
          success.removeAttribute('hidden');
          success.setAttribute('tabindex', '-1');
          success.focus();
        }
        emit(cfg.events && cfg.events.formSuccess);
        if (cfg.redirectOnSuccess) window.location.href = cfg.redirectOnSuccess;
      };

      if (!cfg.endpoint) {
        // No endpoint configured yet: exercise the real loading -> success path
        // so the states are reviewable before the integration is wired up.
        window.setTimeout(finish, 900);
        return;
      }

      fetch(cfg.endpoint, {
        method: cfg.method || 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        finish();
      }).catch(function () {
        setLoading(false);
        setBanner(true);
        emit(cfg.events && cfg.events.formError, { reason: 'network' });
        if (banner) { banner.setAttribute('tabindex', '-1'); banner.focus(); }
      });
    });
  }

  /* --- Form prefill from a CTA ------------------------------------------ */
  /* A partnership card's CTA jumps to the application form with its own model
     already selected, so the choice is confirmed rather than re-entered. */
  (function prefill() {
    document.querySelectorAll('[data-prefill-field]').forEach(function (link) {
      link.addEventListener('click', function () {
        var name = link.getAttribute('data-prefill-field');
        var value = link.getAttribute('data-prefill-value');
        if (!name || !value) return;
        var controls = document.querySelectorAll('[name="' + name + '"]');
        controls.forEach(function (el) {
          if (el.type === 'radio' || el.type === 'checkbox') {
            if (el.value === value) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    });
  })();

  /* --- Product tour ----------------------------------------------------- */
  /* The third-party embed is inserted only on activation: it keeps the page
     scrollable past the tour, avoids loading a third-party frame on every
     visit, and lets the poster carry a real product screenshot. */
  (function tour() {
    document.querySelectorAll('[data-tour]').forEach(function (el) {
      var trigger = el.querySelector('[data-tour-play]');
      var src = el.getAttribute('data-tour-src');
      if (!trigger || !src) return;

      trigger.addEventListener('click', function () {
        if (el.getAttribute('data-active') === 'true') return;
        var frame = document.createElement('iframe');
        frame.src = src;
        frame.title = el.getAttribute('data-tour-title') || 'Interactive product tour';
        frame.loading = 'lazy';
        frame.setAttribute('allow', 'clipboard-write');
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('frameborder', '0');
        el.appendChild(frame);
        el.setAttribute('data-active', 'true');
        // Move focus into the tour so keyboard users land inside it.
        frame.setAttribute('tabindex', '0');
        frame.focus({ preventScroll: true });
        emit(el.getAttribute('data-tour-event'), { label: el.getAttribute('data-tour-title') || 'Product tour' });
      });
    });
  })();
})();
