let theme = localStorage.getItem('glp1_theme') || 'dark';

let state = {
  scales: [],
  metrics: [],
  medications: [],
  selectedScaleId: null,
  currentTab: 'tab-dashboard',
  isAuthenticated: false,
  weightChart: null,
  bodyCompChart: null,
  sideEffectsChart: null
};

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  initTheme();
  setInitialTimestamps();
  await checkAuthStatus();
  await loadScalesAndMetrics();
  await loadMedications();
  await loadDashboardData();
  await loadRotationSummary();
  await loadFinancialStats();
  await loadSideEffectsAnalytics();
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtonUI();
}

function toggleTheme() {
  theme = (theme === 'dark') ? 'light' : 'dark';
  localStorage.setItem('glp1_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtonUI();
  if (state.currentTab === 'tab-dashboard') {
    loadDashboardData();
  } else if (state.currentTab === 'tab-side-effects') {
    loadSideEffectsAnalytics();
  }
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

function setInitialTimestamps() {
  const now = new Date();
  const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  const todayDate = now.toISOString().slice(0, 10);

  if (document.getElementById('measTimestamp')) document.getElementById('measTimestamp').value = localIso;
  if (document.getElementById('injTimestamp')) document.getElementById('injTimestamp').value = localIso;
  if (document.getElementById('seTimestamp')) document.getElementById('seTimestamp').value = localIso;
  if (document.getElementById('purDate')) document.getElementById('purDate').value = todayDate;
}

// Tab Switching logic
function switchTab(tabId) {
  if (tabId !== 'tab-dashboard' && !state.isAuthenticated) {
    toggleAuthModal();
    alert('Protected View: Unauthenticated guests can only view the Dashboard. Please log in to view or modify data.');
    return;
  }

  state.currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });

  // Refresh tab specific views
  if (tabId === 'tab-dashboard') {
    loadDashboardData();
  } else if (tabId === 'tab-measurements') {
    loadMeasurementsTable();
  } else if (tabId === 'tab-injections') {
    loadInjectionsTable();
    loadRotationSummary();
    renderMedicationsTable();
  } else if (tabId === 'tab-purchases') {
    loadPurchasesTable();
    loadFinancialStats();
  } else if (tabId === 'tab-side-effects') {
    loadSideEffectsTable();
    loadSideEffectsAnalytics();
  } else if (tabId === 'tab-settings') {
    renderScalesTable();
    renderMetricsTable();
  }
}

// Master Data: Fetch Scales & Metrics
async function loadScalesAndMetrics() {
  try {
    const [resScales, resMetrics] = await Promise.all([
      fetch('/api/scales'),
      fetch('/api/metrics')
    ]);
    state.scales = await resScales.json();
    state.metrics = await resMetrics.json();

    populateScaleSelects();
    renderDynamicScaleForm();
  } catch (err) {
    console.error('Error loading scales/metrics:', err);
  }
}

async function loadMedications() {
  try {
    const res = await fetch('/api/medications');
    state.medications = await res.json();
    populateMedicationSelects();
    renderMedicationsTable();
  } catch (err) {
    console.error('Error loading medications:', err);
  }
}

function populateScaleSelects() {
  const dashSelect = document.getElementById('dashScaleFilter');
  const formSelect = document.getElementById('measScaleSelect');

  if (dashSelect) {
    dashSelect.innerHTML = '<option value="0">All Scale Sources (Unified)</option>';
    state.scales.forEach(s => {
      dashSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
  }

  if (formSelect) {
    formSelect.innerHTML = '';
    state.scales.forEach((s, idx) => {
      formSelect.innerHTML += `<option value="${s.id}">${s.name} ${s.description ? '(' + s.description + ')' : ''}</option>`;
    });
    if (state.scales.length > 0) {
      formSelect.value = state.scales[0].id;
    }
  }
}

function populateMedicationSelects() {
  const injSelect = document.getElementById('injMedicationSelect');
  const purSelect = document.getElementById('purMedicationSelect');

  if (injSelect) {
    injSelect.innerHTML = state.medications.map(m => `<option value="${m.id}">${m.name} (${m.active_ingredient})</option>`).join('');
    updateDoseStepOptions();
  }

  if (purSelect) {
    purSelect.innerHTML = state.medications.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  }
}

function updateDoseStepOptions() {
  const medId = parseInt(document.getElementById('injMedicationSelect').value);
  const med = state.medications.find(m => m.id === medId);
  const doseSelect = document.getElementById('injDosageMg');
  if (med && med.dosage_steps && med.dosage_steps.length > 0) {
    doseSelect.innerHTML = med.dosage_steps.map(d => `<option value="${d}">${d} mg</option>`).join('');
  } else {
    doseSelect.innerHTML = '<option value="0.25">0.25 mg</option><option value="0.5">0.5 mg</option><option value="1.0">1.0 mg</option><option value="1.7">1.7 mg</option><option value="2.4">2.4 mg</option>';
  }
}

/* SECTION 3 & 4: DYNAMIC MEASUREMENT INPUT FORM */
function renderDynamicScaleForm() {
  const scaleSelect = document.getElementById('measScaleSelect');
  if (!scaleSelect || !scaleSelect.value) return;

  const scaleId = parseInt(scaleSelect.value);
  const scale = state.scales.find(s => s.id === scaleId);
  const fieldsGrid = document.getElementById('dynamicFieldsGrid');
  const titleEl = document.getElementById('scaleFormTitle');

  if (!scale) return;

  titleEl.innerText = `Assigned Metrics for Scale: "${scale.name}"`;
  fieldsGrid.innerHTML = '';

  const assignedKeys = scale.assigned_metric_keys || [];
  const assignedMetrics = state.metrics.filter(m => assignedKeys.includes(m.key));

  if (assignedMetrics.length === 0) {
    fieldsGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No metrics assigned to this scale yet. Edit scale settings to assign metrics.</div>';
    return;
  }

  assignedMetrics.forEach(m => {
    const isWeight = m.key === 'weight_kg';
    const reqAttr = isWeight ? 'required' : '';
    fieldsGrid.innerHTML += `
      <div class="form-group">
        <label for="metric_input_${m.key}">${m.label} (${m.unit}):</label>
        <input type="number" step="0.01" id="metric_input_${m.key}" data-metric-key="${m.key}" placeholder="0.00" ${reqAttr}>
      </div>
    `;
  });
}

async function handleSaveMeasurement(event) {
  event.preventDefault();
  const editId = document.getElementById('measEditId').value;
  const scaleId = parseInt(document.getElementById('measScaleSelect').value);
  const timestamp = document.getElementById('measTimestamp').value;
  const notes = document.getElementById('measNotes').value;

  // Gather metric values
  const inputs = document.querySelectorAll('#dynamicFieldsGrid input[data-metric-key]');
  const dataPayload = {};
  inputs.forEach(input => {
    const val = input.value.trim();
    if (val !== '') {
      dataPayload[input.dataset.metricKey] = parseFloat(val);
    }
  });

  if (Object.keys(dataPayload).length === 0) {
    alert('Please enter at least one metric value.');
    return;
  }

  const payload = {
    scale_id: scaleId,
    timestamp: timestamp,
    notes: notes,
    data: dataPayload
  };

  try {
    const url = editId ? `/api/measurements/${editId}` : '/api/measurements';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      resetMeasurementForm();
      await loadMeasurementsTable();
      await loadDashboardData();
      alert(editId ? 'Measurement log updated' : 'Measurement recorded successfully');
    } else {
      const err = await res.json();
      alert('Error saving measurement: ' + (err.detail || 'Failed'));
    }
  } catch (e) {
    console.error(e);
    alert('Failed to communicate with server');
  }
}

function resetMeasurementForm() {
  document.getElementById('measEditId').value = '';
  document.getElementById('measNotes').value = '';
  setInitialTimestamps();
  document.querySelectorAll('#dynamicFieldsGrid input').forEach(inp => inp.value = '');
}

async function loadMeasurementsTable() {
  try {
    const res = await fetch('/api/measurements?limit=100');
    const logs = await res.json();
    const tbody = document.getElementById('measurementsTableBody');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim);">No measurement logs recorded yet.</td></tr>';
      return;
    }

    logs.forEach(l => {
      const dateFormatted = l.timestamp ? l.timestamp.replace('T', ' ') : '';
      const w = l.data.weight_kg !== undefined ? l.data.weight_kg + ' kg' : '--';
      const fat = l.data.body_fat_pct !== undefined ? l.data.body_fat_pct + ' %' : '--';
      const muscle = l.data.muscle_mass_kg !== undefined ? l.data.muscle_mass_kg + ' kg' : '--';
      const bmi = l.data.bmi !== undefined ? l.data.bmi : '--';

      tbody.innerHTML += `
        <tr>
          <td class="num">${dateFormatted}</td>
          <td><span class="site-badge">${l.scale_name || 'Scale'}</span></td>
          <td class="num" style="font-weight: 600;">${w}</td>
          <td class="num">${fat}</td>
          <td class="num">${muscle}</td>
          <td class="num">${bmi}</td>
          <td>${l.notes || ''}</td>
          <td>
            <button class="btn btn-sm" onclick="editMeasurement(${l.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMeasurement(${l.id})">Del</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function editMeasurement(id) {
  try {
    const res = await fetch(`/api/measurements/${id}`);
    const meas = await res.json();
    document.getElementById('measEditId').value = meas.id;
    document.getElementById('measScaleSelect').value = meas.scale_id;
    renderDynamicScaleForm();

    document.getElementById('measTimestamp').value = meas.timestamp ? meas.timestamp.slice(0, 16) : '';
    document.getElementById('measNotes').value = meas.notes || '';

    // Fill in metric input fields
    setTimeout(() => {
      Object.keys(meas.data).forEach(k => {
        const inp = document.getElementById(`metric_input_${k}`);
        if (inp) inp.value = meas.data[k];
      });
    }, 50);

    switchTab('tab-measurements');
  } catch (err) {
    console.error(err);
  }
}

async function deleteMeasurement(id) {
  if (!confirm('Are you sure you want to delete this measurement entry?')) return;
  try {
    const res = await fetch(`/api/measurements/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadMeasurementsTable();
      loadDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

/* SECTION 8: DASHBOARD & LINEAR PROJECTION ENGINE */
async function loadDashboardData() {
  const scaleFilter = document.getElementById('dashScaleFilter').value;
  const windowDays = document.getElementById('dashWindowDays').value;

  try {
    const res = await fetch(`/api/analytics/dashboard?scale_id=${scaleFilter}&window_days=${windowDays}`);
    const dash = await res.json();

    // Render KPI values
    document.getElementById('kpiCurrentWeight').innerText = dash.current_weight_kg ? `${dash.current_weight_kg} kg` : '-- kg';
    document.getElementById('kpiTotalLost').innerText = `Total Lost: ${dash.total_lost_kg} kg`;
    document.getElementById('kpiTargetWeight').innerText = `${dash.target_weight_kg} kg`;

    const proj = dash.projections || {};
    document.getElementById('kpiRate7d').innerText = proj.rate_kg_per_week ? `${proj.rate_kg_per_week} kg/wk` : '--';
    document.getElementById('kpiProjectedGoalDate').innerText = proj.projected_goal_date || 'N/A';
    document.getElementById('kpiDaysToGoal').innerText = proj.days_to_goal !== null ? `${proj.days_to_goal} days remaining` : '--';

    // Summary Box
    document.getElementById('projCurrentWeight').innerText = dash.current_weight_kg ? `${dash.current_weight_kg} kg` : '--';
    document.getElementById('projTargetWeight').innerText = `${dash.target_weight_kg} kg`;
    document.getElementById('projRate').innerText = proj.rate_kg_per_week ? `${proj.rate_kg_per_week} kg/week` : '0 kg/wk';
    document.getElementById('projDate').innerText = proj.projected_goal_date || 'N/A';
    document.getElementById('projMuscleRatio').innerText = proj.muscle_loss_ratio_pct ? `${proj.muscle_loss_ratio_pct}%` : '0%';

    // Lean Mass Protection Warning Banner
    const warningBanner = document.getElementById('leanMassWarningBanner');
    if (proj.lean_mass_warning) {
      warningBanner.style.display = 'flex';
      document.getElementById('leanMassWarningText').innerText = proj.warning_message;
    } else {
      warningBanner.style.display = 'none';
    }

    // Render Weight Trajectory Chart
    renderWeightChart(dash.weight_moving_averages || [], dash.medication_overlays || []);
    // Render Body Comp Chart
    renderBodyCompChart(dash.fat_moving_averages || [], dash.muscle_moving_averages || []);

  } catch (err) {
    console.error('Error loading dashboard analytics:', err);
  }
}

function renderWeightChart(weightSeries, overlays) {
  const ctx = document.getElementById('weightChart').getContext('2d');
  if (state.weightChart) state.weightChart.destroy();

  const labels = weightSeries.map(s => s.date);
  const rawVals = weightSeries.map(s => s.raw_val);
  const ma7d = weightSeries.map(s => s.ma_7d);
  const ma14d = weightSeries.map(s => s.ma_14d);

  state.weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Raw Weight (kg)',
          data: rawVals,
          borderColor: '#475569',
          backgroundColor: 'rgba(71, 85, 105, 0.1)',
          borderWidth: 1.5,
          pointRadius: 3,
          tension: 0.1
        },
        {
          label: '7-Day Moving Avg',
          data: ma7d,
          borderColor: '#06b6d4',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.3
        },
        {
          label: '14-Day Moving Avg',
          data: ma14d,
          borderColor: '#38bdf8',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f1f5f9', font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

function renderBodyCompChart(fatSeries, muscleSeries) {
  const ctx = document.getElementById('bodyCompChart').getContext('2d');
  if (state.bodyCompChart) state.bodyCompChart.destroy();

  const labels = fatSeries.map(s => s.date);
  const fatVals = fatSeries.map(s => s.raw_val);
  const muscleVals = muscleSeries.map(s => s.raw_val);

  state.bodyCompChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Body Fat (%)',
          data: fatVals,
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'yFat'
        },
        {
          label: 'Muscle Mass (kg)',
          data: muscleVals,
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'yMuscle'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } } },
        yFat: {
          type: 'linear', position: 'left',
          grid: { color: '#1e293b' },
          ticks: { color: '#f59e0b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        yMuscle: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 10 } }
        }
      },
      plugins: { legend: { labels: { color: '#f1f5f9' } } }
    }
  });
}

/* SECTION 6: INJECTIONS & SITE ROTATION GUIDE */
async function loadRotationSummary() {
  try {
    const res = await fetch('/api/injections/rotation-summary');
    const summary = await res.json();

    // Recommended Next Site Badge
    const badge = document.getElementById('recommendedNextSiteBadge');
    if (summary.recommended_next_site) {
      badge.innerText = `Recommended: ${summary.recommended_next_site.label}`;
    }

    // Site History List
    const histList = document.getElementById('siteRotationHistoryList');
    histList.innerHTML = '';
    summary.site_history.forEach(sh => {
      const lastStr = sh.last_used ? sh.last_used.slice(0, 10) : 'Never';
      histList.innerHTML += `
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-subtle); padding: 2px 0;">
          <span>${sh.label}:</span>
          <span class="num" style="color: var(--text-muted);">${lastStr} (${sh.total_uses} uses)</span>
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
  }
}

function selectSiteFromSvg(siteKey) {
  document.getElementById('injSite').value = siteKey;
  highlightSelectedSite(siteKey);
}

function highlightSelectedSite(siteKey) {
  document.querySelectorAll('.body-part').forEach(el => el.classList.remove('selected'));
  const svgEl = document.getElementById(`svg_site_${siteKey}`);
  if (svgEl) svgEl.classList.add('selected');
}

async function handleSaveInjection(event) {
  event.preventDefault();
  const editId = document.getElementById('injEditId').value;
  const medId = parseInt(document.getElementById('injMedicationSelect').value);
  const dosage = parseFloat(document.getElementById('injDosageMg').value);
  const ts = document.getElementById('injTimestamp').value;
  const site = document.getElementById('injSite').value;
  const notes = document.getElementById('injNotes').value;

  const payload = {
    medication_id: medId,
    dosage_mg: dosage,
    timestamp: ts,
    site: site,
    notes: notes
  };

  try {
    const url = editId ? `/api/injections/${editId}` : '/api/injections';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      resetInjectionForm();
      await loadInjectionsTable();
      await loadRotationSummary();
      await loadFinancialStats();
      await loadDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

function resetInjectionForm() {
  document.getElementById('injEditId').value = '';
  document.getElementById('injNotes').value = '';
  setInitialTimestamps();
}

async function loadInjectionsTable() {
  try {
    const res = await fetch('/api/injections');
    const injs = await res.json();
    const tbody = document.getElementById('injectionsTableBody');
    tbody.innerHTML = '';

    if (injs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">No injections recorded.</td></tr>';
      return;
    }

    injs.forEach(i => {
      tbody.innerHTML += `
        <tr>
          <td class="num">${i.timestamp ? i.timestamp.replace('T', ' ') : ''}</td>
          <td style="font-weight: 600;">${i.medication_name || 'GLP-1'}</td>
          <td class="num" style="color: var(--accent-cyan); font-weight:700;">${i.dosage_mg} mg</td>
          <td><span class="site-badge">${i.site_label}</span></td>
          <td>${i.notes || ''}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="deleteInjection(${i.id})">Del</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteInjection(id) {
  if (!confirm('Delete injection record?')) return;
  await fetch(`/api/injections/${id}`, { method: 'DELETE' });
  loadInjectionsTable();
  loadRotationSummary();
  loadFinancialStats();
}

/* SECTION 6: PURCHASES & FINANCIAL INVENTORY */
async function loadFinancialStats() {
  try {
    const res = await fetch('/api/purchases/financial-inventory-stats');
    const stats = await res.json();

    document.getElementById('kpiTotalCost').innerText = `${stats.currency}${stats.total_cost}`;
    document.getElementById('kpiJourneyDays').innerText = `Across ${stats.journey_days} journey days`;
    document.getElementById('kpiDailyCost').innerText = `${stats.currency}${stats.daily_expenditure} / day`;
    document.getElementById('kpiMonthlyCost').innerText = `${stats.currency}${stats.monthly_expenditure} / mo`;
    document.getElementById('kpiDosesFridgeCount').innerText = `${stats.doses_in_fridge} Doses`;
    document.getElementById('kpiDosesTotalStat').innerText = `Purchased: ${stats.total_doses_purchased} | Injected: ${stats.total_doses_injected}`;

    // Update Dashboard Fridge Supply KPI
    document.getElementById('kpiDosesInFridge').innerText = `${stats.doses_in_fridge} Doses`;
    document.getElementById('kpiRefillRunOut').innerText = `Refill due: ${stats.projected_refill_date}`;
  } catch (err) {
    console.error(err);
  }
}

async function handleSavePurchase(event) {
  event.preventDefault();
  const medId = parseInt(document.getElementById('purMedicationSelect').value);
  const pDate = document.getElementById('purDate').value;
  const packSize = parseInt(document.getElementById('purPackSize').value);
  const doseMg = parseFloat(document.getElementById('purDoseMg').value);
  const pharmacy = document.getElementById('purPharmacy').value;
  const cost = parseFloat(document.getElementById('purCost').value);

  const payload = {
    medication_id: medId,
    purchase_date: pDate,
    pack_size_doses: packSize,
    dose_mg: doseMg,
    pharmacy_source: pharmacy,
    total_cost: cost
  };

  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      resetPurchaseForm();
      loadPurchasesTable();
      loadFinancialStats();
    }
  } catch (err) {
    console.error(err);
  }
}

function resetPurchaseForm() {
  document.getElementById('purCost').value = '';
  document.getElementById('purPharmacy').value = '';
}

async function loadPurchasesTable() {
  try {
    const res = await fetch('/api/purchases');
    const list = await res.json();
    const tbody = document.getElementById('purchasesTableBody');
    tbody.innerHTML = '';

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">No purchase records logged.</td></tr>';
      return;
    }

    list.forEach(p => {
      tbody.innerHTML += `
        <tr>
          <td class="num">${p.purchase_date}</td>
          <td style="font-weight: 600;">${p.medication_name || 'GLP-1'}</td>
          <td class="num">${p.pack_size_doses} doses</td>
          <td class="num">${p.dose_mg} mg</td>
          <td>${p.pharmacy_source || ''}</td>
          <td class="num" style="color: var(--accent-emerald); font-weight:700;">${p.currency}${p.total_cost}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})">Del</button></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function deletePurchase(id) {
  if (!confirm('Delete purchase record?')) return;
  await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
  loadPurchasesTable();
  loadFinancialStats();
}

/* SECTION 6: SIDE EFFECTS DIARY */
async function handleSaveSideEffect(event) {
  event.preventDefault();
  const ts = document.getElementById('seTimestamp').value;
  const symptom = document.getElementById('seSymptomName').value;
  const sev = parseInt(document.getElementById('seSeverity').value);
  const notes = document.getElementById('seNotes').value;

  try {
    const res = await fetch('/api/side_effects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: ts, symptom_name: symptom, severity: sev, notes: notes })
    });
    if (res.ok) {
      document.getElementById('seNotes').value = '';
      loadSideEffectsTable();
      loadSideEffectsAnalytics();
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadSideEffectsTable() {
  try {
    const res = await fetch('/api/side_effects');
    const list = await res.json();
    const tbody = document.getElementById('sideEffectsTableBody');
    tbody.innerHTML = '';

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No side effects logged.</td></tr>';
      return;
    }

    list.forEach(se => {
      tbody.innerHTML += `
        <tr>
          <td class="num">${se.timestamp ? se.timestamp.replace('T', ' ') : ''}</td>
          <td style="font-weight:600;">${se.symptom_name}</td>
          <td><span class="num" style="color: var(--accent-amber); font-weight:700;">Level ${se.severity}/5</span></td>
          <td>${se.notes || ''}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteSideEffect(${se.id})">Del</button></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteSideEffect(id) {
  await fetch(`/api/side_effects/${id}`, { method: 'DELETE' });
  loadSideEffectsTable();
  loadSideEffectsAnalytics();
}

async function loadSideEffectsAnalytics() {
  try {
    const res = await fetch('/api/side_effects/analytics');
    const analytics = await res.json();
    renderSideEffectsChart(analytics.weekday_breakdown || []);
  } catch (err) {
    console.error(err);
  }
}

function renderSideEffectsChart(weekdayData) {
  const ctx = document.getElementById('sideEffectsChart').getContext('2d');
  if (state.sideEffectsChart) state.sideEffectsChart.destroy();

  state.sideEffectsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weekdayData.map(w => w.day),
      datasets: [{
        label: 'Symptom Occurrence Count',
        data: weekdayData.map(w => w.count),
        backgroundColor: 'rgba(245, 158, 11, 0.5)',
        borderColor: '#f59e0b',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', stepSize: 1 } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

/* SECTION 3: SCALE SETTINGS MODAL & PROFILE MANAGEMENT */
function renderScalesTable() {
  const tbody = document.getElementById('scalesTableBody');
  tbody.innerHTML = '';
  state.scales.forEach(s => {
    const metricsBadges = (s.metrics || []).map(m => `<span class="site-badge" style="margin:2px;">${m.label}</span>`).join('');
    tbody.innerHTML += `
      <tr>
        <td style="font-weight: 600;">${s.name}</td>
        <td>${s.description || ''}</td>
        <td>${metricsBadges || '<span style="color:var(--text-dim)">None</span>'}</td>
        <td>
          <button class="btn btn-sm" onclick="editScaleModal(${s.id})">Edit Profile</button>
          <button class="btn btn-sm btn-danger" onclick="deleteScaleProfile(${s.id})">Deactivate</button>
        </td>
      </tr>
    `;
  });
}

function openNewScaleModal() {
  document.getElementById('modalScaleId').value = '';
  document.getElementById('modalScaleName').value = '';
  document.getElementById('modalScaleDesc').value = '';
  renderMetricsCheckboxes([]);
  document.getElementById('scaleModal').classList.add('open');
}

function editScaleModal(id) {
  const scale = state.scales.find(s => s.id === id);
  if (!scale) return;
  document.getElementById('modalScaleId').value = scale.id;
  document.getElementById('modalScaleName').value = scale.name;
  document.getElementById('modalScaleDesc').value = scale.description || '';
  renderMetricsCheckboxes(scale.assigned_metric_keys || []);
  document.getElementById('scaleModal').classList.add('open');
}

function renderMetricsCheckboxes(assignedKeys) {
  const box = document.getElementById('modalMetricsCheckboxes');
  box.innerHTML = '';
  state.metrics.forEach(m => {
    const isChecked = assignedKeys.includes(m.key) ? 'checked' : '';
    box.innerHTML += `
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
        <input type="checkbox" value="${m.key}" ${isChecked}>
        <span>${m.label} (${m.unit})</span>
      </label>
    `;
  });
}

function closeScaleModal() {
  document.getElementById('scaleModal').classList.remove('open');
}

async function handleSaveScaleModal(event) {
  event.preventDefault();
  const id = document.getElementById('modalScaleId').value;
  const name = document.getElementById('modalScaleName').value;
  const desc = document.getElementById('modalScaleDesc').value;

  const checkedKeys = [];
  document.querySelectorAll('#modalMetricsCheckboxes input:checked').forEach(cb => {
    checkedKeys.push(cb.value);
  });

  const payload = { name: name, description: desc, assigned_metrics: checkedKeys };
  const url = id ? `/api/scales/${id}` : '/api/scales';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeScaleModal();
      await loadScalesAndMetrics();
      renderScalesTable();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteScaleProfile(id) {
  if (!confirm('Deactivate this scale profile? Existing measurement logs will remain intact.')) return;
  await fetch(`/api/scales/${id}`, { method: 'DELETE' });
  await loadScalesAndMetrics();
  renderScalesTable();
}

async function saveTargetWeight() {
  const val = parseFloat(document.getElementById('targetWeightInput').value);
  await fetch(`/api/analytics/settings/target-weight?target_weight_kg=${val}`, { method: 'POST' });
  loadDashboardData();
  alert('Target weight updated');
}

/* SECTION 9: EXPORT & IMPORT */
async function handleImportJson() {
  const fileInput = document.getElementById('jsonImportFile');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a JSON file to upload.');
    return;
  }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/import/json', { method: 'POST', body: formData });
    const result = await res.json();
    if (res.ok) {
      alert(result.message);
      location.reload();
    } else {
      alert('Import failed: ' + result.detail);
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleImportCsv() {
  const fileInput = document.getElementById('csvImportFile');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a CSV file to upload.');
    return;
  }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/import/csv', { method: 'POST', body: formData });
    const result = await res.json();
    if (res.ok) {
      alert(result.message);
      loadMeasurementsTable();
      loadDashboardData();
    } else {
      alert('CSV Import failed: ' + result.detail);
    }
  } catch (err) {
    console.error(err);
  }
}

/* AUTHENTICATION */
function toggleAuthModal() {
  document.getElementById('authModal').classList.toggle('open');
}

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    state.isAuthenticated = !!data.authenticated;
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
      if (state.currentTab !== 'tab-dashboard') {
        switchTab('tab-dashboard');
      }
    }
    updateTabLockBadges();
  } catch (e) {}
}

function updateTabLockBadges() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.dataset.tab;
    let badgeSpan = btn.querySelector('.lock-badge');
    if (tabId !== 'tab-dashboard' && !state.isAuthenticated) {
      if (!badgeSpan) {
        badgeSpan = document.createElement('span');
        badgeSpan.className = 'lock-badge';
        badgeSpan.style.marginLeft = '4px';
        badgeSpan.style.fontSize = '11px';
        badgeSpan.innerText = '🔒';
        btn.appendChild(badgeSpan);
      }
    } else {
      if (badgeSpan) badgeSpan.remove();
    }
  });
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const password = document.getElementById('authPasswordInput').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password })
  });
  if (res.ok) {
    toggleAuthModal();
    await checkAuthStatus();
    alert('Successfully authenticated! All tabs and features are now unlocked.');
  } else {
    alert('Invalid password');
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  await checkAuthStatus();
  alert('Logged out. Application switched to read-only guest mode.');
}

/* METRIC DEFINITIONS MANAGER (Add, Edit, Remove Input Fields) */
function renderMetricsTable() {
  const tbody = document.getElementById('metricsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.metrics.forEach(m => {
    const isCustomBadge = m.is_custom ? '<span class="site-badge" style="background:rgba(168,85,247,0.15); color:var(--accent-purple);">Custom</span>' : '<span style="color:var(--text-dim); font-size:11px;">Standard</span>';
    tbody.innerHTML += `
      <tr>
        <td class="num" style="font-weight:600;">${m.key}</td>
        <td>${m.label}</td>
        <td class="num">${m.unit}</td>
        <td><span class="site-badge">${m.category}</span></td>
        <td>${isCustomBadge}</td>
        <td>
          <button class="btn btn-sm" onclick="editMetricModal('${m.key}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMetricField('${m.key}')">Remove</button>
        </td>
      </tr>
    `;
  });
}

function openNewMetricModal() {
  document.getElementById('modalMetricOriginalKey').value = '';
  document.getElementById('modalMetricKey').value = '';
  document.getElementById('modalMetricKey').disabled = false;
  document.getElementById('modalMetricLabel').value = '';
  document.getElementById('modalMetricUnit').value = '';
  document.getElementById('modalMetricCategory').value = 'body_comp';
  document.getElementById('metricModalTitle').innerText = 'Create Metric Input Field';
  document.getElementById('metricModal').classList.add('open');
}

function editMetricModal(key) {
  const m = state.metrics.find(x => x.key === key);
  if (!m) return;
  document.getElementById('modalMetricOriginalKey').value = m.key;
  document.getElementById('modalMetricKey').value = m.key;
  document.getElementById('modalMetricKey').disabled = true;
  document.getElementById('modalMetricLabel').value = m.label;
  document.getElementById('modalMetricUnit').value = m.unit;
  document.getElementById('modalMetricCategory').value = m.category || 'body_comp';
  document.getElementById('metricModalTitle').innerText = `Edit Metric Field: ${m.key}`;
  document.getElementById('metricModal').classList.add('open');
}

function closeMetricModal() {
  document.getElementById('metricModal').classList.remove('open');
}

async function handleSaveMetricModal(event) {
  event.preventDefault();
  const origKey = document.getElementById('modalMetricOriginalKey').value;
  const key = document.getElementById('modalMetricKey').value;
  const label = document.getElementById('modalMetricLabel').value;
  const unit = document.getElementById('modalMetricUnit').value;
  const category = document.getElementById('modalMetricCategory').value;

  try {
    let res;
    if (origKey) {
      res = await fetch(`/api/metrics/${origKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, unit, category })
      });
    } else {
      res = await fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label, unit, category })
      });
    }

    if (res.ok) {
      closeMetricModal();
      await loadScalesAndMetrics();
      renderMetricsTable();
      renderScalesTable();
    } else {
      const err = await res.json();
      alert('Error saving metric: ' + (err.detail || 'Failed'));
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteMetricField(key) {
  if (!confirm(`Deactivate metric field "${key}"? Existing historic measurements will remain intact non-destructively.`)) return;
  try {
    const res = await fetch(`/api/metrics/${key}`, { method: 'DELETE' });
    if (res.ok) {
      await loadScalesAndMetrics();
      renderMetricsTable();
      renderScalesTable();
    }
  } catch (e) {
    console.error(e);
  }
}

/* MEDICATION PROFILES MANAGER (Add, Edit, Remove Medications & Dosage Steps) */
function renderMedicationsTable() {
  const tbody = document.getElementById('medicationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.medications.forEach(m => {
    const stepsFormatted = (m.dosage_steps || []).map(s => `${s} mg`).join(', ') || 'None';
    const formFormatted = (m.form || 'subcutaneous_pen').replace('_', ' ');
    tbody.innerHTML += `
      <tr>
        <td style="font-weight:600;">${m.name}</td>
        <td>${m.active_ingredient || ''}</td>
        <td><span class="num" style="color:var(--accent-cyan); font-weight:600;">${stepsFormatted}</span></td>
        <td><span class="site-badge">${formFormatted}</span></td>
        <td>${m.notes || ''}</td>
        <td>
          <button class="btn btn-sm" onclick="editMedicationModal(${m.id})">Edit Profile</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMedicationProfile(${m.id})">Remove</button>
        </td>
      </tr>
    `;
  });
}

function openNewMedicationModal() {
  document.getElementById('modalMedId').value = '';
  document.getElementById('modalMedName').value = '';
  document.getElementById('modalMedIngredient').value = '';
  document.getElementById('modalMedSteps').value = '0.25';
  document.getElementById('modalMedForm').value = 'subcutaneous_pen';
  document.getElementById('modalMedNotes').value = '';
  document.getElementById('medicationModalTitle').innerText = 'Create Medication Profile';
  document.getElementById('medicationModal').classList.add('open');
}

function editMedicationModal(id) {
  const m = state.medications.find(x => x.id === id);
  if (!m) return;
  document.getElementById('modalMedId').value = m.id;
  document.getElementById('modalMedName').value = m.name;
  document.getElementById('modalMedIngredient').value = m.active_ingredient || '';
  document.getElementById('modalMedSteps').value = (m.dosage_steps || []).join(', ');
  document.getElementById('modalMedForm').value = m.form || 'subcutaneous_pen';
  document.getElementById('modalMedNotes').value = m.notes || '';
  document.getElementById('medicationModalTitle').innerText = `Edit Medication Profile: ${m.name}`;
  document.getElementById('medicationModal').classList.add('open');
}

function closeMedicationModal() {
  document.getElementById('medicationModal').classList.remove('open');
}

async function handleSaveMedicationModal(event) {
  event.preventDefault();
  const id = document.getElementById('modalMedId').value;
  const name = document.getElementById('modalMedName').value;
  const ingredient = document.getElementById('modalMedIngredient').value;
  const stepsRaw = document.getElementById('modalMedSteps').value;
  const form = document.getElementById('modalMedForm').value;
  const notes = document.getElementById('modalMedNotes').value;

  const stepsParsed = stepsRaw.split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  if (stepsParsed.length === 0) {
    alert('Please enter at least one valid dosage step number in mg (e.g. 0.25).');
    return;
  }

  const payload = {
    name: name,
    active_ingredient: ingredient,
    dosage_steps: stepsParsed,
    form: form,
    notes: notes
  };

  try {
    const url = id ? `/api/medications/${id}` : '/api/medications';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeMedicationModal();
      await loadMedications();
      renderMedicationsTable();
      alert('Medication profile saved successfully');
    } else {
      const err = await res.json();
      alert('Error saving medication: ' + (err.detail || 'Failed'));
    }
  } catch (e) {
    console.error(e);
  }
}

async function deleteMedicationProfile(id) {
  if (!confirm('Deactivate this medication profile? Injection history will be preserved.')) return;
  try {
    const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadMedications();
      renderMedicationsTable();
    }
  } catch (e) {
    console.error(e);
  }
}

