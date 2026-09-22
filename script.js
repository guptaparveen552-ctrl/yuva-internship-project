/* ==========================================================================
   Pathlight Dashboard
   --------------------------------------------------------------------------
   Fetches data.json once, then does all filtering/sorting/rendering in
   memory — no repeat network requests. DOM updates are batched (a single
   innerHTML write per render) rather than looping with appendChild, which
   keeps table re-renders cheap even though nothing here is large enough for
   that to matter in practice; it's the same batching principle from the
   Week 4 performance work applied at a smaller scale.
   ========================================================================== */
(function () {
  'use strict';

  var state = {
    problems: [],
    sortKey: null,
    sortDir: 'asc'
  };

  var els = {
    generatedDate: document.getElementById('generated-date'),
    statTotal: document.getElementById('stat-total'),
    statStreak: document.getElementById('stat-streak'),
    statWeek: document.getElementById('stat-week'),
    statGoal: document.getElementById('stat-goal'),
    chartContainer: document.getElementById('chart-container'),
    chartDataList: document.getElementById('chart-data-list'),
    searchInput: document.getElementById('search-input'),
    topicFilter: document.getElementById('topic-filter'),
    statusFilter: document.getElementById('status-filter'),
    resultCount: document.getElementById('result-count'),
    tbody: document.getElementById('problems-tbody'),
    table: document.getElementById('problems-table')
  };

  // --- Small debounce helper for the search box -------------------------
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- Load data ----------------------------------------------------------
  fetch('data.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      state.problems = data.problems || [];
      renderHeader(data);
      renderChart(data.weeklyActivity || []);
      populateTopicFilter(state.problems);
      render();
    })
    .catch(function (err) {
      els.resultCount.textContent = 'Could not load problem data (' + err.message + ').';
      els.tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Data failed to load. Try refreshing the page.</td></tr>';
      console.error('[Pathlight Dashboard] Failed to load data.json', err);
    });

  // --- Header + stat cards --------------------------------------------------
  function renderHeader(data) {
    els.generatedDate.textContent = data.generatedAt || '—';

    var doneCount = state.problems.filter(function (p) { return p.status === 'Done'; }).length;
    var weekCount = (data.weeklyActivity || []).reduce(function (sum, d) { return sum + d.solved; }, 0);

    els.statTotal.textContent = doneCount;
    els.statStreak.textContent = (data.summary && data.summary.currentStreakDays || 0) + ' days';
    els.statWeek.textContent = weekCount;
    els.statGoal.textContent = weekCount + ' / ' + (data.summary && data.summary.weeklyGoal || '—');
  }

  // --- Chart: accessible SVG bar chart + text alternative -----------------
  function renderChart(weeklyActivity) {
    if (!weeklyActivity.length) return;

    var max = Math.max.apply(null, weeklyActivity.map(function (d) { return d.solved; })) || 1;
    var w = 640, h = 220, padBottom = 30, padTop = 20, barGap = 16;
    var barWidth = (w - barGap * (weeklyActivity.length + 1)) / weeklyActivity.length;

    var summary = weeklyActivity.map(function (d) { return d.day + ' ' + d.solved; }).join(', ');
    var ariaLabel = 'Weekly activity chart. Problems solved per day: ' + summary + '.';

    var bars = weeklyActivity.map(function (d, i) {
      var barHeight = (d.solved / max) * (h - padTop - padBottom);
      var x = barGap + i * (barWidth + barGap);
      var y = h - padBottom - barHeight;
      return (
        '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="3" fill="#5eead4"></rect>' +
        '<text class="bar-value" x="' + (x + barWidth / 2) + '" y="' + (y - 6) + '" text-anchor="middle">' + d.solved + '</text>' +
        '<text class="bar-label" x="' + (x + barWidth / 2) + '" y="' + (h - 8) + '" text-anchor="middle">' + d.day + '</text>'
      );
    }).join('');

    els.chartContainer.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + escapeHtml(ariaLabel) + '">' + bars + '</svg>';

    // Text alternative: the exact same numbers, always in the DOM.
    els.chartDataList.innerHTML = weeklyActivity.map(function (d) {
      return '<li>' + escapeHtml(d.day) + ': ' + d.solved + ' solved</li>';
    }).join('');
  }

  // --- Filters: build the topic dropdown from the data itself -------------
  function populateTopicFilter(problems) {
    var topics = Array.from(new Set(problems.map(function (p) { return p.topic; }))).sort();
    var options = topics.map(function (t) {
      return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>';
    }).join('');
    els.topicFilter.insertAdjacentHTML('beforeend', options);
  }

  // --- Filtering + sorting + rendering ------------------------------------
  function getFiltered() {
    var q = els.searchInput.value.trim().toLowerCase();
    var topic = els.topicFilter.value;
    var status = els.statusFilter.value;

    var list = state.problems.filter(function (p) {
      if (q && p.title.toLowerCase().indexOf(q) === -1) return false;
      if (topic !== 'all' && p.topic !== topic) return false;
      if (status !== 'all' && p.status !== status) return false;
      return true;
    });

    if (state.sortKey) {
      var key = state.sortKey;
      var dir = state.sortDir === 'asc' ? 1 : -1;
      list.sort(function (a, b) {
        var av = a[key], bv = b[key];
        if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }

    return list;
  }

  function statusClass(status) {
    if (status === 'Done') return 'status-done';
    if (status === 'In Progress') return 'status-progress';
    return 'status-todo';
  }

  function render() {
    var filtered = getFiltered();

    if (!filtered.length) {
      els.tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No problems match your filters.</td></tr>';
    } else {
      els.tbody.innerHTML = filtered.map(function (p) {
        return (
          '<tr>' +
          '<td>' + escapeHtml(p.title) + '</td>' +
          '<td>' + escapeHtml(p.topic) + '</td>' +
          '<td>' + escapeHtml(p.difficulty) + '</td>' +
          '<td><span class="status-pill ' + statusClass(p.status) + '">' + escapeHtml(p.status) + '</span></td>' +
          '<td>' + (p.date ? escapeHtml(p.date) : '—') + '</td>' +
          '<td>' + (p.minutes || '—') + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    els.resultCount.textContent = 'Showing ' + filtered.length + ' of ' + state.problems.length + ' problems.';
  }

  // --- Sorting: click or keyboard-activate a column header button ---------
  els.table.querySelectorAll('.sort-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-key');

      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }

      // Reset every header's aria-sort/indicator, then set the active one —
      // only one column is ever marked as sorted at a time.
      els.table.querySelectorAll('th').forEach(function (th) { th.setAttribute('aria-sort', 'none'); });
      els.table.querySelectorAll('.sort-indicator').forEach(function (s) { s.textContent = ''; });

      var th = btn.closest('th');
      th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      btn.querySelector('.sort-indicator').textContent = state.sortDir === 'asc' ? '▲' : '▼';

      render();
    });
  });

  // --- Filter controls ------------------------------------------------------
  els.searchInput.addEventListener('input', debounce(render, 150));
  els.topicFilter.addEventListener('change', render);
  els.statusFilter.addEventListener('change', render);
})();
