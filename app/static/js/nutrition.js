// Nutrition page — intentionally standalone (not app.js). app.js's DOMContentLoaded
// handler unconditionally loads dashboard/injections/scales data and touches
// dashboard-only DOM elements that don't exist here, so it can't be reused as-is.
// The small theme/auth block below duplicates the equivalent functions in app.js;
// if you change login/theme behavior there, mirror it here too.

let theme = localStorage.getItem('glp1_theme') || 'dark';
let isAuthenticated = false;
let proteinChart = null;
let hydrationChart = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setDefaultTimestamps();
  checkAuthStatus();
  loadTodaySummary();
  loadSummaryAndRender();
  loadRecentLogs();
});

// ── Theme (duplicated from app.js) ────────────────────────────────────────

function initTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtonUI();
}

function toggleTheme() {
  theme = (theme === 'dark') ? 'light' : 'dark';
  localStorage.setItem('glp1_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtonUI();
  loadSummaryAndRender(); // re-render charts so grid/tick colors match the new theme
}

function updateThemeButtonUI() {
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');
  if (theme === 'light') {
    if (icon) icon.innerText = '🌙';
    if (label) label.innerText = 'Dark Mode';
  } else {
    if (icon) icon.innerText = '☀️';
    if (label) label.innerText = 'Light Mode';
  }
}

// ── Auth (duplicated from app.js) ─────────────────────────────────────────

function toggleAuthModal() {
  document.getElementById('authModal').classList.toggle('open');
}

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    isAuthenticated = !!data.authenticated;
    const btn = document.getElementById('authBtn');
    const badge = document.getElementById('authStatusBadge');
    if (data.authenticated) {
      btn.innerText = 'Logout';
      btn.onclick = handleLogout;
      if (badge) badge.innerHTML = '<span style="color: var(--accent-emerald);">● Admin Active</span>';
    } else {
      btn.innerText = 'Login';
      btn.onclick = toggleAuthModal;
      if (badge) badge.innerHTML = '<span style="color: var(--text-dim);">Guest Mode (Read-Only)</span>';
    }
  } catch (e) {}
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const password = document.getElementById('authPasswordInput').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
    });
    if (res.ok) {
      toggleAuthModal();
      await checkAuthStatus();
    } else {
      const err = await res.json().catch(() => ({ detail: 'HTTP ' + res.status }));
      alert('Login Error: ' + (err.detail || ('HTTP ' + res.status)));
    }
  } catch (e) {
    alert('Network Error during login: ' + e.message);
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  await checkAuthStatus();
}

// ── Helpers ────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowLocalDatetimeValue() {
  const now = new Date();
  return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

function setDefaultTimestamps() {
  document.getElementById('proteinTimestamp').value = nowLocalDatetimeValue();
  document.getElementById('hydrationTimestamp').value = nowLocalDatetimeValue();
}

function chartTickColor() {
  return theme === 'light' ? '#475569' : '#94a3b8';
}

function chartGridColor() {
  return theme === 'light' ? '#e2e8f0' : '#1e293b';
}

// ── Today's KPIs + hydration goal ─────────────────────────────────────

async function loadTodaySummary() {
  const today = todayStr();

  const [proteinRes, hydrationRes, goalRes] = await Promise.all([
    fetch(`/api/nutrition/protein?start_date=${today}&end_date=${today}&limit=500`),
    fetch(`/api/nutrition/hydration?start_date=${today}&end_date=${today}&limit=500`),
    fetch(`/api/nutrition/hydration-goal/${today}`),
  ]);
  const proteinEntries = await proteinRes.json();
  const hydrationEntries = await hydrationRes.json();
  const goal = await goalRes.json();

  const totalProtein = proteinEntries.reduce((sum, e) => sum + e.protein_grams, 0);
  document.getElementById('kpiProteinToday').innerText = `${totalProtein.toFixed(0)} g`;
  document.getElementById('kpiProteinEntries').innerText = `${proteinEntries.length} entr${proteinEntries.length === 1 ? 'y' : 'ies'} logged`;

  const totalOz = hydrationEntries.reduce((sum, e) => sum + e.ounces, 0);
  const goalOz = goal.goal_oz;
  const pct = goalOz > 0 ? Math.min(100, Math.round((totalOz / goalOz) * 100)) : 0;

  document.getElementById('kpiHydrationToday').innerText = `${totalOz.toFixed(0)} / ${goalOz.toFixed(0)} oz`;
  document.getElementById('kpiHydrationPct').innerText = `${pct}% of goal`;
  document.getElementById('hydrationProgressBar').style.width = `${pct}%`;
  document.getElementById('hydrationProgressBar').style.background = pct >= 100 ? 'var(--accent-emerald)' : 'var(--accent-blue)';
  document.getElementById('hydrationGoalInput').value = goalOz;

  const card = document.getElementById('kpiHydrationCard');
  card.classList.toggle('highlight', pct >= 100);
}

async function saveHydrationGoal() {
  if (!isAuthenticated) { alert('Login required to change the hydration goal.'); return; }
  const goalOz = parseFloat(document.getElementById('hydrationGoalInput').value);
  if (!goalOz || goalOz <= 0) { alert('Enter a goal greater than 0.'); return; }
  try {
    const res = await fetch('/api/nutrition/hydration-goal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr(), goal_oz: goalOz }),
    });
    if (!res.ok) throw new Error('save failed');
    await loadTodaySummary();
    await loadSummaryAndRender();
  } catch (e) {
    alert('Failed to save goal: ' + e.message);
  }
}

// ── Log submission ─────────────────────────────────────────────────────

async function submitProteinLog(event) {
  event.preventDefault();
  if (!isAuthenticated) { alert('Login required to log entries.'); return; }
  const payload = {
    timestamp: document.getElementById('proteinTimestamp').value,
    protein_grams: parseFloat(document.getElementById('proteinGrams').value),
    notes: document.getElementById('proteinNotes').value,
  };
  try {
    const res = await fetch('/api/nutrition/protein', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'save failed');
    document.getElementById('proteinGrams').value = '';
    document.getElementById('proteinNotes').value = '';
    setDefaultTimestamps();
    await loadTodaySummary();
    await loadSummaryAndRender();
    await loadRecentLogs();
  } catch (e) {
    alert('Failed to log protein: ' + e.message);
  }
}

async function submitHydrationLog(event) {
  event.preventDefault();
  if (!isAuthenticated) { alert('Login required to log entries.'); return; }
  const payload = {
    timestamp: document.getElementById('hydrationTimestamp').value,
    ounces: parseFloat(document.getElementById('hydrationOunces').value),
    notes: document.getElementById('hydrationNotes').value,
  };
  try {
    const res = await fetch('/api/nutrition/hydration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'save failed');
    document.getElementById('hydrationOunces').value = '';
    document.getElementById('hydrationNotes').value = '';
    setDefaultTimestamps();
    await loadTodaySummary();
    await loadSummaryAndRender();
    await loadRecentLogs();
  } catch (e) {
    alert('Failed to log water: ' + e.message);
  }
}

// ── Recent entries tables ──────────────────────────────────────────────

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function loadRecentLogs() {
  const [proteinRes, hydrationRes] = await Promise.all([
    fetch('/api/nutrition/protein?limit=20'),
    fetch('/api/nutrition/hydration?limit=20'),
  ]);
  const proteinEntries = await proteinRes.json();
  const hydrationEntries = await hydrationRes.json();

  const proteinBody = document.getElementById('proteinLogTableBody');
  proteinBody.innerHTML = proteinEntries.map(e => `
    <tr>
      <td>${formatTimestamp(e.timestamp)}</td>
      <td class="num">${e.protein_grams} g</td>
      <td>${e.notes || ''}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteProteinLog(${e.id})">Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="color: var(--text-dim);">No entries yet.</td></tr>';

  const hydrationBody = document.getElementById('hydrationLogTableBody');
  hydrationBody.innerHTML = hydrationEntries.map(e => `
    <tr>
      <td>${formatTimestamp(e.timestamp)}</td>
      <td class="num">${e.ounces} oz</td>
      <td>${e.notes || ''}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteHydrationLog(${e.id})">Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="color: var(--text-dim);">No entries yet.</td></tr>';
}

async function deleteProteinLog(id) {
  if (!isAuthenticated) { alert('Login required.'); return; }
  if (!confirm('Delete this protein entry?')) return;
  await fetch(`/api/nutrition/protein/${id}`, { method: 'DELETE' });
  await loadTodaySummary();
  await loadSummaryAndRender();
  await loadRecentLogs();
}

async function deleteHydrationLog(id) {
  if (!isAuthenticated) { alert('Login required.'); return; }
  if (!confirm('Delete this hydration entry?')) return;
  await fetch(`/api/nutrition/hydration/${id}`, { method: 'DELETE' });
  await loadTodaySummary();
  await loadSummaryAndRender();
  await loadRecentLogs();
}

// ── Trend charts ─────────────────────────────────────────────────────

async function loadSummaryAndRender() {
  const windowDays = parseInt(document.getElementById('trendWindowSelect').value, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (windowDays - 1));
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const res = await fetch(`/api/nutrition/summary?start_date=${startStr}&end_date=${endStr}`);
  const data = await res.json();
  renderProteinChart(data.days);
  renderHydrationChart(data.days);
}

function renderProteinChart(days) {
  const ctx = document.getElementById('proteinChart').getContext('2d');
  if (proteinChart) proteinChart.destroy();

  proteinChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => d.date),
      datasets: [{
        label: 'Protein (g)',
        data: days.map(d => d.protein_grams),
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        borderColor: '#10b981',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { family: 'JetBrains Mono', size: 11 } } },
        y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { family: 'JetBrains Mono', size: 11 } }, title: { display: true, text: 'grams', color: chartTickColor() } },
      },
      plugins: { legend: { labels: { color: chartTickColor(), font: { family: 'Inter', size: 12 } } } },
    },
  });
}

function renderHydrationChart(days) {
  const ctx = document.getElementById('hydrationChart').getContext('2d');
  if (hydrationChart) hydrationChart.destroy();

  hydrationChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => d.date),
      datasets: [
        {
          label: 'Hydration (oz)',
          data: days.map(d => d.hydration_oz),
          backgroundColor: 'rgba(56, 189, 248, 0.5)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'Goal (oz)',
          type: 'line',
          data: days.map(d => d.hydration_goal_oz),
          borderColor: '#f59e0b',
          borderDash: [4, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { family: 'JetBrains Mono', size: 11 } } },
        y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { family: 'JetBrains Mono', size: 11 } }, title: { display: true, text: 'oz', color: chartTickColor() } },
      },
      plugins: { legend: { labels: { color: chartTickColor(), font: { family: 'Inter', size: 12 } } } },
    },
  });
}
