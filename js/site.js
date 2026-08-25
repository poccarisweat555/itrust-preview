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

  /* --- Hero email capture ----------------------------------------------- */
  /* Validates inline, then hands the address to the full demo form rather than
     submitting a half-complete lead from the hero. */
  (function emailCapture() {
    var EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
    document.querySelectorAll('[data-email-capture]').forEach(function (form) {
      var input = form.querySelector('input[type="email"]');
      var out = form.querySelector('[role="alert"] span');
      if (!input) return;

      function fail(message) {
        form.setAttribute('data-invalid', 'true');
        input.setAttribute('aria-invalid', 'true');
        if (out) out.textContent = message;
        input.focus();
      }
      function clear() {
        form.setAttribute('data-invalid', 'false');
        input.setAttribute('aria-invalid', 'false');
        if (out) out.textContent = '';
      }

      input.addEventListener('input', function () {
        if (form.getAttribute('data-invalid') === 'true' && EMAIL.test(input.value.trim())) clear();
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var value = input.value.trim();
        if (!value) return fail(input.getAttribute('data-msg-required') || 'Enter your work email address.');
        if (!EMAIL.test(value)) return fail(input.getAttribute('data-msg-type') || 'Enter a valid email address.');
        clear();

        var target = form.getAttribute('data-target') || '/request-a-demo/';
        var label = (form.querySelector('[data-track-label]') || {}).getAttribute
          ? form.querySelector('[data-track-label]').getAttribute('data-track-label')
          : 'Hero email capture';
        emit('cta_request_demo_click', { label: label, page_path: window.location.pathname });

        // An anchor target means the form is on this page: fill it in place
        // rather than reloading, which would lose the visitor's position.
        if (target.charAt(0) === '#') {
          var section = document.querySelector(target);
          var dest = document.querySelector(target + ' form[data-async-form] input[type="email"]')
            || document.querySelector('form[data-async-form] input[type="email"]');
          if (dest) {
            dest.value = value;
            dest.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (section) section.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
          var next = Array.prototype.slice
            .call(document.querySelectorAll('form[data-async-form] input, form[data-async-form] select'))
            .filter(function (el) { return el.type !== 'hidden' && el.hasAttribute('required') && !el.value; })[0];
          if (next) window.setTimeout(function () { next.focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 420);
          input.value = '';
          return;
        }

        window.location.href = target + (target.indexOf('?') > -1 ? '&' : '?') + 'email=' + encodeURIComponent(value);
      });
    });
  })();

  /* --- Carry a captured email into the demo form ------------------------- */
  (function prefillFromQuery() {
    var email = new URLSearchParams(window.location.search).get('email');
    if (!email) return;
    var field = document.querySelector('form[data-async-form] input[type="email"]');
    if (!field) return;
    field.value = email;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    // Send the visitor to the first field still needing an answer.
    var next = Array.prototype.slice
      .call(document.querySelectorAll('form[data-async-form] input, form[data-async-form] select'))
      .filter(function (el) { return el.type !== 'hidden' && el.hasAttribute('required') && !el.value; })[0];
    if (next) next.focus({ preventScroll: true });
  })();

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

  /* --- Overview dashboard ----------------------------------------------- */
  /* Reveals on scroll (counters, meters, rings, sparklines), collapses its
     module group, and cross-highlights a module from the summary row. */
  (function dashboard() {
    document.querySelectorAll('[data-dashboard]').forEach(function (root) {
      var counters = Array.prototype.slice.call(root.querySelectorAll('[data-count]'));
      var gauges = Array.prototype.slice.call(root.querySelectorAll('[data-gauge], [data-ring]'));

      function setRings(progress) {
        gauges.forEach(function (el) {
          var target = parseFloat(el.getAttribute('data-ring') || '0');
          if (el.hasAttribute('data-gauge')) {
            var max = parseFloat(el.getAttribute('data-gauge-max')) || 10;
            target = (parseFloat(el.getAttribute('data-gauge')) / max) * 100;
          }
          el.style.setProperty('--pct', (target * progress).toFixed(2));
        });
      }

      function setCounters(progress) {
        counters.forEach(function (el) {
          var target = parseFloat(el.getAttribute('data-count'));
          if (isNaN(target)) return;
          var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
          el.textContent = (target * progress).toFixed(decimals);
        });
      }

      function finish() {
        setRings(1);
        setCounters(1);
        root.classList.add('is-shown');
      }

      function animate() {
        if (root.dataset.shown === 'true') return;
        root.dataset.shown = 'true';
        root.classList.add('is-shown');
        root.removeAttribute('data-prep');
        // Reset the bars to zero width for one frame, then let CSS ease them out.
        root.querySelectorAll('.dash__meter i, .dash__segbar i').forEach(function (el) {
          el.style.transition = 'none';
          el.style.width = '0';
          void el.offsetWidth;
          el.style.transition = '';
          el.style.width = '';
        });
        if (reduceMotion.matches) { finish(); return; }
        var start = null;
        var duration = 1100;
        (function step(now) {
          if (start === null) start = now;
          var t = Math.min((now - start) / duration, 1);
          // easeOutCubic
          var eased = 1 - Math.pow(1 - t, 3);
          setRings(eased);
          setCounters(eased);
          if (t < 1) window.requestAnimationFrame(step);
          else finish();
        })(window.performance.now());
      }

      // The markup already carries the real values, so they are only reset to
      // zero when this script is about to animate them up.
      if (reduceMotion.matches || !('IntersectionObserver' in window)) {
        finish();
        root.dataset.shown = 'true';
      } else {
        root.setAttribute('data-prep', 'true');
        setRings(0);
        setCounters(0);
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) { animate(); io.disconnect(); }
          });
        }, { threshold: 0.25 });
        io.observe(root);
      }

      /* Collapse / expand the module group. */
      var collapse = root.querySelector('[data-dash-collapse]');
      var grid = root.querySelector('.dash__module-grid');
      if (collapse && grid) {
        collapse.addEventListener('click', function () {
          var open = collapse.getAttribute('aria-expanded') === 'true';
          collapse.setAttribute('aria-expanded', String(!open));
          if (open) grid.setAttribute('hidden', '');
          else grid.removeAttribute('hidden');
        });
      }

      /* Summary row highlights the matching module card. */
      var scores = Array.prototype.slice.call(root.querySelectorAll('[data-dash-score]'));
      var modules = Array.prototype.slice.call(root.querySelectorAll('[data-dash-module]'));
      scores.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-dash-score');
          var on = btn.getAttribute('aria-pressed') === 'true';
          scores.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          modules.forEach(function (m) { m.classList.remove('is-focus'); });
          if (on) return; // second click clears the highlight
          btn.setAttribute('aria-pressed', 'true');
          var card = modules.filter(function (m) { return m.getAttribute('data-dash-module') === id; })[0];
          if (!card) return;
          if (grid && grid.hasAttribute('hidden') && collapse) collapse.click();
          card.classList.add('is-focus');
          card.focus({ preventScroll: true });
          card.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
        });
      });
    });
  })();

  /* --- Finding lifecycle walkthrough ------------------------------------ */
  /* Advances on its own, so it ships with a real pause control, pauses when
     the visitor interacts or focuses it, and holds still under reduced motion. */
  (function lifecycle() {
    document.querySelectorAll('[data-lifecycle]').forEach(function (root) {
      var stages;
      try { stages = JSON.parse(root.getAttribute('data-stages') || '[]'); } catch (e) { return; }
      if (!stages.length) return;

      var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-stage]'));
      var status = root.querySelector('[data-lifecycle-status]');
      var owner = root.querySelector('[data-lifecycle-owner]');
      var days = root.querySelector('[data-lifecycle-days]');
      var bar = root.querySelector('[data-lifecycle-bar]');
      var progress = root.querySelector('[data-lifecycle-progress]');
      var kicker = root.querySelector('[data-lifecycle-kicker]');
      var bodyEl = root.querySelector('[data-lifecycle-body]');
      var code = root.querySelector('[data-lifecycle-code]');
      var next = root.querySelector('[data-lifecycle-next]');
      var replay = root.querySelector('[data-lifecycle-replay]');
      var toggle = root.querySelector('[data-lifecycle-toggle]');
      var toggleLabel = root.querySelector('[data-lifecycle-playlabel]');

      var current = 0;
      var timer = null;
      var playing = false;
      var last = stages.length - 1;

      function render(index) {
        current = index;
        var s = stages[index];

        buttons.forEach(function (b, i) {
          var state = i < index ? 'done' : i === index ? (i === last ? 'closed' : 'current') : 'todo';
          b.setAttribute('data-state', state);
          b.setAttribute('aria-current', i === index ? 'step' : 'false');
        });

        status.textContent = s.status;
        status.setAttribute('data-tone', s.tone);
        owner.textContent = s.owner;
        days.textContent = String(s.days);
        bar.style.width = Math.round(((index + 1) / stages.length) * 100) + '%';
        bar.style.background = index === last ? 'var(--success)' : 'var(--brand)';
        progress.textContent = 'Stage ' + (index + 1) + ' of ' + stages.length;
        kicker.textContent = s.kicker;
        bodyEl.textContent = s.body;
        if (s.code) { code.textContent = s.code; code.removeAttribute('hidden'); }
        else { code.textContent = ''; code.setAttribute('hidden', ''); }
        next.textContent = index === last ? 'Start over' : 'Next stage';
      }

      function setPlaying(state) {
        playing = state;
        window.clearInterval(timer);
        if (state) {
          timer = window.setInterval(function () { render((current + 1) % stages.length); }, 4200);
        }
        toggle.setAttribute('aria-pressed', String(!state));
        toggleLabel.textContent = state ? 'Pause' : 'Play';
      }

      buttons.forEach(function (b, i) {
        b.addEventListener('click', function () { setPlaying(false); render(i); });
      });
      next.addEventListener('click', function () {
        setPlaying(false);
        render(current === last ? 0 : current + 1);
      });
      replay.addEventListener('click', function () { render(0); setPlaying(true); });
      toggle.addEventListener('click', function () { setPlaying(!playing); });

      // Pause while the visitor is reading or tabbing through it.
      root.addEventListener('focusin', function () { if (playing) setPlaying(false); });
      root.addEventListener('mouseenter', function () { if (playing) setPlaying(false); });

      render(0);

      if (reduceMotion.matches) {
        setPlaying(false);
      } else if ('IntersectionObserver' in window) {
        // Only run while it is actually on screen.
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !playing && current === 0) setPlaying(true);
            else if (!entry.isIntersecting && playing) setPlaying(false);
          });
        }, { threshold: 0.35 });
        io.observe(root);
      } else {
        setPlaying(true);
      }

      reduceMotion.addEventListener('change', function (ev) { if (ev.matches) setPlaying(false); });
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
