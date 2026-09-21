/* ==========================================================================
   Pathlight Journal — accessibility-focused interactivity
   --------------------------------------------------------------------------
   Every disclosure here (mobile menu, Articles dropdown, search box) follows
   the same pattern: a real <button> with aria-expanded, a hidden panel that
   becomes visible on activation, and Escape / outside-click to close.
   Nothing here relies on :hover, so all of it works by keyboard and touch.
   ========================================================================== */
(function () {
  'use strict';

  function wireDisclosure(toggleEl, panelEl, opts) {
    opts = opts || {};

    function isOpen() {
      return toggleEl.getAttribute('aria-expanded') === 'true';
    }

    function open() {
      toggleEl.setAttribute('aria-expanded', 'true');
      panelEl.hidden = false;
      if (opts.parentClass) opts.parentClass.classList.add('is-open');
      if (opts.focusFirst) {
        var first = panelEl.querySelector('a, button, input');
        if (first) first.focus();
      }
    }

    function close(returnFocus) {
      toggleEl.setAttribute('aria-expanded', 'false');
      panelEl.hidden = true;
      if (opts.parentClass) opts.parentClass.classList.remove('is-open');
      if (returnFocus) toggleEl.focus();
    }

    toggleEl.addEventListener('click', function () {
      if (isOpen()) close(false); else open();
    });

    panelEl.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        close(true);
      }
    });

    document.addEventListener('click', function (event) {
      if (!isOpen()) return;
      if (toggleEl.contains(event.target) || panelEl.contains(event.target)) return;
      close(false);
    });

    return { open: open, close: close, isOpen: isOpen };
  }

  var navToggle = document.getElementById('nav-toggle');
  var navList = document.getElementById('primary-nav-list');
  var navMenu = document.querySelector('.navmenu');
  if (navToggle && navList) {
    wireDisclosure(navToggle, navList, { parentClass: navMenu });
  }

  var articlesBtn = document.getElementById('articles-btn');
  var articlesMenu = document.getElementById('articles-menu');
  if (articlesBtn && articlesMenu) {
    wireDisclosure(articlesBtn, articlesMenu, { focusFirst: true });
  }

  var searchToggle = document.getElementById('search-toggle');
  var searchForm = document.getElementById('search-form');
  if (searchToggle && searchForm) {
    wireDisclosure(searchToggle, searchForm, { focusFirst: true });
  }
})();
