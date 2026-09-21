/* ==========================================================================
   Pathlight Modal — a reusable, accessible modal dialog component
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no build step.

   HOW IT WORKS
   ------------
   Any element with [data-modal-open="<id>"] opens the modal whose
   id matches. Any element inside the modal with [data-modal-close]
   closes it. Everything else (ARIA state, focus trapping, ESC key,
   backdrop click, scroll lock) is handled here.

   PUBLIC API
   ----------
     const m = Modal.get('confirm-modal');
     m.open(trigger?)   -> opens, remembers where focus came from
     m.close()          -> closes, returns focus to the trigger
     m.toggle()
     m.isOpen           -> boolean
     m.on('open' | 'close' | 'confirm', handler)

     Modal.get(id)      -> instance for that id (or null)
     Modal.closeAll()
     Modal.init(root?)  -> wire up any new markup added after page load

   WHY A CLASS + REGISTRY
   ----------------------
   Each modal in the page is one instance, so state (isOpen, the element
   that opened it, its own listeners) stays with that modal instead of
   living in shared globals. Adding a fourth or fifth modal to the page
   needs zero extra JavaScript — just markup.
   ========================================================================== */

(function (window, document) {
  'use strict';

  /* --- Feature detection ------------------------------------------------
     Older browsers may lack these. We degrade rather than crash:
     - no classList.toggle(force)  -> we never rely on the force argument
     - no Element.closest          -> polyfilled below
     - no CSS transitions          -> modal appears instantly (still usable)
     - no :focus-visible           -> CSS falls back to :focus outlines
  ---------------------------------------------------------------------- */
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(selector)) return el;
        el = el.parentElement;
      }
      return null;
    };
  }

  var SUPPORTS_TRANSITIONS = 'transition' in document.documentElement.style;

  // Elements that can receive keyboard focus inside a modal.
  var FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  var registry = {};   // id -> Modal instance
  var openStack = [];  // supports one modal opened from inside another

  /* ======================================================================
     Modal
     ====================================================================== */
  function Modal(element) {
    if (!element || !element.id) {
      // Error handling: a modal with no id can never be targeted, so we
      // report the problem instead of failing silently later on.
      console.warn('[Modal] Skipped a .modal element with no id attribute.', element);
      return null;
    }

    this.el = element;
    this.id = element.id;
    this.dialog = element.querySelector('.modal-dialog');
    this.isOpen = false;
    this.lastFocused = null;
    this.handlers = { open: [], close: [], confirm: [] };

    if (!this.dialog) {
      console.warn('[Modal] "' + this.id + '" has no .modal-dialog child; using the modal element itself.');
      this.dialog = element;
    }

    this._setupAria();
    this._bind();

    registry[this.id] = this;
  }

  /* --- ARIA wiring ------------------------------------------------------
     Set only what is missing, so markup can override any of it.
  ---------------------------------------------------------------------- */
  Modal.prototype._setupAria = function () {
    this.el.setAttribute('aria-hidden', 'true');
    this.dialog.setAttribute('role', this.dialog.getAttribute('role') || 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('tabindex', '-1');

    var title = this.el.querySelector('.modal-title');
    if (title && !this.dialog.getAttribute('aria-labelledby')) {
      if (!title.id) title.id = this.id + '-title';
      this.dialog.setAttribute('aria-labelledby', title.id);
    }

    var desc = this.el.querySelector('.modal-desc');
    if (desc && !this.dialog.getAttribute('aria-describedby')) {
      if (!desc.id) desc.id = this.id + '-desc';
      this.dialog.setAttribute('aria-describedby', desc.id);
    }
  };

  Modal.prototype._bind = function () {
    var self = this;

    // Close buttons and the backdrop.
    this.el.addEventListener('click', function (event) {
      if (event.target.closest('[data-modal-close]')) {
        event.preventDefault();
        self.close();
        return;
      }
      // Clicking the dimmed area closes, unless opted out with
      // data-modal-static (used for the destructive confirm dialog).
      if (event.target === self.el && !self.el.hasAttribute('data-modal-static')) {
        self.close();
      }
    });

    // Keyboard: ESC closes, Tab is trapped inside the dialog.
    this.el.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        self.close();
      } else if (event.key === 'Tab') {
        self._trapFocus(event);
      }
    });
  };

  /* --- Focus trap -------------------------------------------------------
     Keeps Tab / Shift+Tab cycling inside the dialog while it is open,
     which is the part screen-reader and keyboard users depend on most.
  ---------------------------------------------------------------------- */
  Modal.prototype._trapFocus = function (event) {
    var items = Array.prototype.filter.call(
      this.dialog.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null; } // skip hidden items
    );

    if (!items.length) {
      event.preventDefault();
      this.dialog.focus();
      return;
    }

    var first = items[0];
    var last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  Modal.prototype.open = function (trigger) {
    if (this.isOpen) return this;

    this.lastFocused = trigger || document.activeElement;
    this.el.setAttribute('aria-hidden', 'false');
    this.el.classList.add('is-open');
    document.body.classList.add('has-modal-open'); // locks background scroll
    this.isOpen = true;
    openStack.push(this);

    // Move focus to the first useful control, or the dialog itself.
    var target = this.dialog.querySelector('[data-modal-autofocus]')
      || this.dialog.querySelector(FOCUSABLE)
      || this.dialog;

    // Wait one frame so the element is painted before we focus it.
    var self = this;
    window.requestAnimationFrame(function () { self._safeFocus(target); });

    this._emit('open');
    return this;
  };

  Modal.prototype.close = function () {
    if (!this.isOpen) return this;

    var self = this;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    openStack = openStack.filter(function (m) { return m !== self; });

    if (!openStack.length) document.body.classList.remove('has-modal-open');

    // Hide from assistive tech only after the exit transition finishes,
    // so the animation is not cut short. Without transition support we
    // hide straight away.
    var finish = function () {
      if (!self.isOpen) self.el.setAttribute('aria-hidden', 'true');
    };

    if (SUPPORTS_TRANSITIONS) {
      window.setTimeout(finish, 200);
    } else {
      finish();
    }

    this._safeFocus(this.lastFocused);
    this.lastFocused = null;

    this._emit('close');
    return this;
  };

  Modal.prototype.toggle = function (trigger) {
    return this.isOpen ? this.close() : this.open(trigger);
  };

  // focus() can throw on detached or disabled nodes in some browsers.
  Modal.prototype._safeFocus = function (el) {
    if (!el || typeof el.focus !== 'function') return;
    try {
      el.focus();
    } catch (err) {
      console.warn('[Modal] Could not move focus.', err);
    }
  };

  /* --- Tiny event system ------------------------------------------------ */
  Modal.prototype.on = function (name, handler) {
    if (!this.handlers[name]) this.handlers[name] = [];
    if (typeof handler === 'function') this.handlers[name].push(handler);
    return this;
  };

  Modal.prototype._emit = function (name, detail) {
    var self = this;
    (this.handlers[name] || []).forEach(function (handler) {
      // One broken handler should not stop the modal from working.
      try {
        handler.call(self, detail);
      } catch (err) {
        console.error('[Modal] Handler for "' + name + '" threw.', err);
      }
    });
  };

  /* ======================================================================
     Static helpers
     ====================================================================== */
  Modal.get = function (id) {
    return registry[id] || null;
  };

  Modal.closeAll = function () {
    Object.keys(registry).forEach(function (id) { registry[id].close(); });
  };

  // Scans for .modal elements and [data-modal-open] triggers.
  // Safe to call again after injecting markup — already-built modals
  // are skipped.
  Modal.init = function (root) {
    var scope = root || document;

    Array.prototype.forEach.call(scope.querySelectorAll('.modal'), function (el) {
      if (!el.id || registry[el.id]) return;
      new Modal(el);
    });

    Array.prototype.forEach.call(scope.querySelectorAll('[data-modal-open]'), function (trigger) {
      if (trigger.dataset.modalBound === 'true') return;
      trigger.dataset.modalBound = 'true';

      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        var id = trigger.getAttribute('data-modal-open');
        var modal = Modal.get(id);

        if (!modal) {
          // Error handling: a trigger pointing at a missing modal tells
          // the developer exactly which id is wrong.
          console.warn('[Modal] No modal found with id "' + id + '".', trigger);
          return;
        }
        modal.open(trigger);
      });
    });

    return Modal;
  };

  window.Modal = Modal;

  // Auto-init once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Modal.init(); });
  } else {
    Modal.init();
  }
})(window, document);
