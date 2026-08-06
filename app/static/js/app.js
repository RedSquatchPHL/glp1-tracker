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

const HASH_TAB_MAP = {
  '#dashboard': 'tab-dashboard',
  '#log-measurement': 'tab-measurements',
  '#measurements': 'tab-measurements',
  '#photos': 'tab-photos',
  '#injections': 'tab-injections',
  '#purchases': 'tab-purchases',
  '#side-effects': 'tab-side-effects',
  '#settings': 'tab-settings',
  '#export': 'tab-settings'
};

const TAB_HASH_MAP = {
  'tab-dashboard': '#dashboard',
  'tab-measurements': '#log-measurement',
  'tab-photos': '#photos',
  'tab-injections': '#injections',
  'tab-purchases': '#purchases',
  'tab-side-effects': '#side-effects',
  'tab-settings': '#settings'
};

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  window.addEventListener('hashchange', handleHashChange);
});

async function initApp() {
  initTheme();
  setInitialTimestamps();
  await checkAuthStatus();
  handleHashChange();
  await loadScalesAndMetrics();
  await loadMedications();
  await loadDashboardData();
  await loadRotationSummary();
  await loadFinancialStats();
  await loadSideEffectsAnalytics();
}

function handleHashChange() {
  const hash = window.location.hash || '#dashboard';
  const targetTab = HASH_TAB_MAP[hash] || 'tab-dashboard';
  switchTab(targetTab, false);
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

  if (document.getElementById('measDate')) document.getElementById('measDate').value = todayDate;
  if (document.getElementById('measTime')) document.getElementById('measTime').value = '';
  if (document.getElementById('injTimestamp')) document.getElementById('injTimestamp').value = localIso;
  if (document.getElementById('seTimestamp')) document.getElementById('seTimestamp').value = localIso;
  if (document.getElementById('purDate')) document.getElementById('purDate').value = todayDate;
}

function switchTab(tabId, updateHash = true) {
  if (tabId !== 'tab-dashboard' && !state.isAuthenticated) {
    toggleAuthModal();
    alert('Protected View: Unauthenticated guests can only view the Dashboard. Please log in to view or modify data.');
    window.location.hash = '#dashboard';
    return;
  }

  state.currentTab = tabId;
  if (updateHash && TAB_HASH_MAP[tabId]) {
    history.replaceState(null, null, TAB_HASH_MAP[tabId]);
  }

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
  } else if (tabId === 'tab-photos') {
    loadPhotos();
  } else if (tabId === 'tab-settings') {
    renderScalesTable();
    renderMetricsTable();
    loadConcomitantMedsTable();
    loadLabResultsTable();
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
  const dateVal = document.getElementById('measDate').value;
  const timeVal = document.getElementById('measTime').value;
  const notes = document.getElementById('measNotes').value;

  // Build timestamp string
  let timestamp = dateVal;
  if (timeVal) {
    timestamp = `${dateVal}T${timeVal}`;
  } else {
    // If time is omitted, append current time under the hood so multiple entries on the same date remain distinct
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);
    timestamp = `${dateVal}T${timeStr}`;
  }

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
      // Display date YYYY-MM-DD (plus time if explicitly provided)
      let dateFormatted = l.timestamp ? l.timestamp.slice(0, 10) : '';
      if (l.timestamp && l.timestamp.includes('T')) {
        const timePart = l.timestamp.split('T')[1].slice(0, 5);
        if (timePart && timePart !== '00:00') {
          dateFormatted += ` ${timePart}`;
        }
      }

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

    if (meas.timestamp) {
      const parts = meas.timestamp.split('T');
      if (document.getElementById('measDate')) document.getElementById('measDate').value = parts[0];
      if (document.getElementById('measTime') && parts[1]) {
        document.getElementById('measTime').value = parts[1].slice(0, 5);
      }
    }
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
    
    const totalLostStr = dash.total_lost_kg !== undefined ? (dash.total_lost_kg <= 0 ? `${dash.total_lost_kg} kg` : `+${dash.total_lost_kg} kg`) : '-- kg';
    document.getElementById('kpiTotalLost').innerText = `Total Lost: ${totalLostStr}`;
    
    // Pharmacokinetics Active Drug Level KPI
    const pk = dash.pharmacokinetics || {};
    const activeValElem = document.getElementById('kpiActiveDrugVal');
    const activeSubElem = document.getElementById('kpiActiveDrugSub');
    if (activeValElem) activeValElem.innerText = pk.current_active_mg !== undefined ? `${pk.current_active_mg} mg` : '-- mg';
    if (activeSubElem) activeSubElem.innerText = pk.primary_medication ? `${pk.primary_medication} (~${pk.half_life_days}d half-life)` : 'Bloodstream kinetics';

    // Cardiometabolic Risk KPI (WHtR & WHR)
    const ratios = dash.body_ratios || {};
    const cardioRiskElem = document.getElementById('kpiCardioRiskVal');
    const cardioSubElem = document.getElementById('kpiCardioRiskSub');
    if (cardioRiskElem) {
      cardioRiskElem.innerText = ratios.cardiometabolic_risk_score || 'N/A';
      if (ratios.cardiometabolic_risk_score === 'High Risk') {
        cardioRiskElem.style.color = 'var(--accent-rose)';
      } else if (ratios.cardiometabolic_risk_score === 'Increased Risk' || ratios.cardiometabolic_risk_score === 'Moderate Risk') {
        cardioRiskElem.style.color = 'var(--accent-amber)';
      } else {
        cardioRiskElem.style.color = 'var(--accent-emerald)';
      }
    }
    if (cardioSubElem) {
      const whtrStr = ratios.whtr ? ratios.whtr : '--';
      const whrStr = ratios.whr ? ratios.whr : '--';
      cardioSubElem.innerText = `WHtR: ${whtrStr} | WHR: ${whrStr}`;
    }

    // Relative Date for Current Weight
    const lastDateElem = document.getElementById('kpiLastWeightDate');
    if (lastDateElem) {
      if (dash.latest_weight_date) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (dash.latest_weight_date === todayStr) {
          lastDateElem.innerText = `Measured: Today`;
        } else {
          const diffDays = Math.round((new Date(todayStr) - new Date(dash.latest_weight_date)) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            lastDateElem.innerText = `Measured: Yesterday`;
          } else if (diffDays > 1) {
            lastDateElem.innerText = `Measured: ${diffDays} days ago (${dash.latest_weight_date})`;
          } else {
            lastDateElem.innerText = `Measured: ${dash.latest_weight_date}`;
          }
        }
      } else {
        lastDateElem.innerText = `No weight logged yet`;
      }
    }

    // Target Weight & Remaining to Goal
    document.getElementById('kpiTargetWeight').innerText = `${dash.target_weight_kg} kg`;
    if (document.getElementById('userNameInput')) document.getElementById('userNameInput').value = dash.user_name || '';
    if (document.getElementById('userDobInput')) document.getElementById('userDobInput').value = dash.user_dob || '';
    if (document.getElementById('userPhysicianInput')) document.getElementById('userPhysicianInput').value = dash.physician_name || '';
    if (document.getElementById('userConditionsInput')) document.getElementById('userConditionsInput').value = dash.medical_conditions || '';
    if (document.getElementById('targetWeightInput')) document.getElementById('targetWeightInput').value = dash.target_weight_kg || 75.0;
    if (document.getElementById('userHeightInput')) document.getElementById('userHeightInput').value = dash.user_height_cm || 175.0;
    if (document.getElementById('userGenderSelect')) document.getElementById('userGenderSelect').value = dash.user_gender || 'unspecified';

    const weightToGoalElem = document.getElementById('kpiWeightToGoal');
    if (weightToGoalElem) {
      if (dash.current_weight_kg !== null && dash.current_weight_kg !== undefined) {
        const rem = dash.weight_to_goal_kg;
        if (rem > 0) {
          weightToGoalElem.innerText = `Remaining: ${rem.toFixed(1)} kg`;
        } else {
          weightToGoalElem.innerText = `Goal Reached! 🎉`;
        }
      } else {
        weightToGoalElem.innerText = `Remaining: -- kg`;
      }
    }

    const proj = dash.projections || {};
    document.getElementById('kpiRate7d').innerText = proj.rate_kg_per_week ? `${proj.rate_kg_per_week} kg/wk` : '--';
    document.getElementById('kpiProjectedGoalDate').innerText = proj.projected_goal_date || 'N/A';
    document.getElementById('kpiDaysToGoal').innerText = proj.days_to_goal !== null ? `${proj.days_to_goal} days remaining` : '--';

    // Render 7, 14, 30, and 90 Days Weight Prognosis Line
    const prog = proj.prognosis || {};
    const elem7d = document.getElementById('prog7d');
    const elem14d = document.getElementById('prog14d');
    const elem30d = document.getElementById('prog30d');
    const elem90d = document.getElementById('prog90d');

    if (elem7d) elem7d.innerText = (prog.in_7d_kg !== null && prog.in_7d_kg !== undefined) ? `${prog.in_7d_kg} kg` : '-- kg';
    if (elem14d) elem14d.innerText = (prog.in_14d_kg !== null && prog.in_14d_kg !== undefined) ? `${prog.in_14d_kg} kg` : '-- kg';
    if (elem30d) elem30d.innerText = (prog.in_30d_kg !== null && prog.in_30d_kg !== undefined) ? `${prog.in_30d_kg} kg` : '-- kg';
    if (elem90d) elem90d.innerText = (prog.in_90d_kg !== null && prog.in_90d_kg !== undefined) ? `${prog.in_90d_kg} kg` : '-- kg';

    // Summary Box
    document.getElementById('projCurrentWeight').innerText = dash.current_weight_kg ? `${dash.current_weight_kg} kg` : '--';
    document.getElementById('projTargetWeight').innerText = `${dash.target_weight_kg} kg`;
    document.getElementById('projRate').innerText = proj.rate_kg_per_week ? `${proj.rate_kg_per_week} kg/week` : '0 kg/wk';
    document.getElementById('projDate').innerText = proj.projected_goal_date || 'N/A';
    document.getElementById('projMuscleRatio').innerText = proj.muscle_loss_ratio_pct ? `${proj.muscle_loss_ratio_pct}%` : '0%';

    // Automated Plateau Detection Diagnostic Banner
    const plateauBanner = document.getElementById('plateauWarningBanner');
    const plateau = dash.plateau_analysis || {};
    if (plateauBanner) {
      if (plateau.is_plateau) {
        plateauBanner.style.display = 'flex';
        document.getElementById('plateauTypeTitle').innerText = `AUTOMATED PLATEAU DETECTED (${plateau.diagnostic_type.toUpperCase()}):`;
        document.getElementById('plateauInsightText').innerText = plateau.diagnostic_insight;
        document.getElementById('plateauRecommendationText').innerText = `Clinical Recommendation: ${plateau.recommendation}`;
      } else {
        plateauBanner.style.display = 'none';
      }
    }

    // Lean Mass Protection Warning Banner
    const warningBanner = document.getElementById('leanMassWarningBanner');
    if (proj.lean_mass_warning) {
      warningBanner.style.display = 'flex';
      document.getElementById('leanMassWarningText').innerText = proj.warning_message;
    } else {
      warningBanner.style.display = 'none';
    }

    // Render Weight Trajectory Chart with Pharmacokinetics Active Drug Overlay
    renderWeightChart(dash.weight_moving_averages || [], pk.series || []);
    // Render Body Comp Chart
    renderBodyCompChart(dash.fat_moving_averages || [], dash.muscle_moving_averages || []);

  } catch (err) {
    console.error('Error loading dashboard analytics:', err);
  }
}

function renderWeightChart(weightSeries, pkSeries) {
  const ctx = document.getElementById('weightChart').getContext('2d');
  if (state.weightChart) state.weightChart.destroy();

  const labels = weightSeries.map(s => s.date);
  const rawVals = weightSeries.map(s => s.raw_val);
  const ma7d = weightSeries.map(s => s.ma_7d);
  const ma14d = weightSeries.map(s => s.ma_14d);

  // Map PK active drug levels to weightSeries dates
  const pkMap = {};
  if (Array.isArray(pkSeries)) {
    pkSeries.forEach(p => pkMap[p.date] = p.active_mg);
  }
  const pkVals = labels.map(d => pkMap[d] !== undefined ? pkMap[d] : null);

  const datasets = [
    {
      label: 'Raw Weight (kg)',
      data: rawVals,
      borderColor: '#475569',
      backgroundColor: 'rgba(71, 85, 105, 0.1)',
      borderWidth: 1.5,
      pointRadius: 3,
      tension: 0.1,
      yAxisID: 'yWeight'
    },
    {
      label: '7-Day Moving Avg',
      data: ma7d,
      borderColor: '#06b6d4',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.3,
      yAxisID: 'yWeight'
    },
    {
      label: '14-Day Moving Avg',
      data: ma14d,
      borderColor: '#38bdf8',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      tension: 0.3,
      yAxisID: 'yWeight'
    }
  ];

  if (pkSeries && pkSeries.length > 0) {
    datasets.push({
      label: 'Active Drug Level (mg)',
      data: pkVals,
      borderColor: '#a855f7',
      backgroundColor: 'rgba(168, 85, 247, 0.1)',
      borderWidth: 2,
      borderDash: [2, 2],
      pointRadius: 2,
      fill: true,
      tension: 0.4,
      yAxisID: 'yActive'
    });
  }

  state.weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
        },
        yWeight: {
          type: 'linear',
          position: 'left',
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
        },
        yActive: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#a855f7', font: { family: 'JetBrains Mono', size: 11 } },
          title: { display: true, text: 'Active Concentration (mg)', color: '#a855f7' }
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
      highlightRecommendedSite(summary.recommended_next_site.site);
    }

    // Smart Injection Reminder Alert Banner on Dashboard
    const smartReminder = summary.smart_reminder;
    const smartBanner = document.getElementById('smartReminderBanner');
    if (smartBanner && smartReminder) {
      if (smartReminder.status !== 'NO_INJECTIONS') {
        smartBanner.style.display = 'flex';
        document.getElementById('smartReminderTitle').innerText = `SMART INJECTION REMINDER (${smartReminder.status.replace('_', ' ')}):`;
        document.getElementById('smartReminderText').innerText = smartReminder.alert_message;
      }
    }

    // Site History List
    const histList = document.getElementById('siteRotationHistoryList');
    if (histList) {
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
    }

  } catch (err) {
    console.error(err);
  }
}

function highlightRecommendedSite(siteKey) {
  document.querySelectorAll('.body-part').forEach(el => el.style.stroke = '#475569');
  const recEl = document.getElementById(`svg_site_${siteKey}`);
  if (recEl) {
    recEl.style.stroke = 'var(--accent-cyan)';
    recEl.style.strokeWidth = '2.5px';
  }
}

async function saveUserProfileSettings(event) {
  event.preventDefault();
  const userName = document.getElementById('userNameInput').value;
  const userDob = document.getElementById('userDobInput').value;
  const physician = document.getElementById('userPhysicianInput').value;
  const conditions = document.getElementById('userConditionsInput').value;
  const targetW = parseFloat(document.getElementById('targetWeightInput').value);
  const heightCm = parseFloat(document.getElementById('userHeightInput').value);
  const gender = document.getElementById('userGenderSelect').value;

  try {
    const res = await fetch('/api/analytics/settings/user-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_name: userName,
        user_dob: userDob,
        physician_name: physician,
        medical_conditions: conditions,
        target_weight_kg: targetW,
        user_height_cm: heightCm,
        user_gender: gender
      })
    });
    if (res.ok) {
      await loadDashboardData();
      alert('Patient clinical demographics & profile settings saved successfully!');
    } else {
      alert('Failed to save profile settings');
    }
  } catch (err) {
    console.error(err);
  }
}

/* CONCOMITANT MEDICATIONS (NON-GLP1 DAILY MEDS & SUPPLEMENTS) */
async function loadConcomitantMedsTable() {
  try {
    const res = await fetch('/api/medications/concomitant/list');
    const list = await res.json();
    const tbody = document.getElementById('concomitantMedsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No concomitant medications logged.</td></tr>';
      return;
    }
    list.forEach(m => {
      tbody.innerHTML += `
        <tr>
          <td style="font-weight: 600;">${escapeHtml(m.name)}</td>
          <td class="num">${escapeHtml(m.dosage)}</td>
          <td>${escapeHtml(m.frequency)}</td>
          <td>${escapeHtml(m.purpose || '')}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteConcomitantMed(${m.id})">Del</button></td>
        </tr>
      `;
    });
  } catch (e) { console.error(e); }
}

function openNewConcomitantMedModal() {
  document.getElementById('concMedName').value = '';
  document.getElementById('concMedDosage').value = '';
  document.getElementById('concMedFrequency').value = '';
  document.getElementById('concMedPurpose').value = '';
  document.getElementById('concMedNotes').value = '';
  document.getElementById('concomitantModal').classList.add('open');
}

function closeConcomitantMedModal() {
  document.getElementById('concomitantModal').classList.remove('open');
}

async function handleSaveConcomitantMed(event) {
  event.preventDefault();
  const name = document.getElementById('concMedName').value;
  const dosage = document.getElementById('concMedDosage').value;
  const freq = document.getElementById('concMedFrequency').value;
  const purpose = document.getElementById('concMedPurpose').value;
  const notes = document.getElementById('concMedNotes').value;

  try {
    const res = await fetch('/api/medications/concomitant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dosage, frequency: freq, purpose, notes })
    });
    if (res.ok) {
      closeConcomitantMedModal();
      loadConcomitantMedsTable();
    }
  } catch (e) { console.error(e); }
}

async function deleteConcomitantMed(id) {
  if (!confirm('Delete concomitant medication record?')) return;
  await fetch(`/api/medications/concomitant/${id}`, { method: 'DELETE' });
  loadConcomitantMedsTable();
}

/* LABORATORY BLOOD WORK & METABOLIC BIOMARKERS */
async function loadLabResultsTable() {
  try {
    const res = await fetch('/api/medications/labs/list');
    const labs = await res.json();
    const tbody = document.getElementById('labResultsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (labs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim);">No laboratory blood work entries logged.</td></tr>';
      return;
    }
    labs.forEach(l => {
      const hba1cStr = l.hba1c_pct !== null ? `${l.hba1c_pct}%` : '--';
      const glucoseStr = l.fasting_glucose_mgdl !== null ? `${l.fasting_glucose_mgdl} mg/dL` : '--';
      const insulinStr = l.fasting_insulin_uiuml !== null ? `${l.fasting_insulin_uiuml} µIU/mL` : '--';
      const lipidsStr = `${l.total_cholesterol_mgdl || '-'}/${l.triglycerides_mgdl || '-'}/${l.hdl_mgdl || '-'}/${l.ldl_mgdl || '-'}`;
      const liverStr = `${l.alt_ul || '-'}/${l.ast_ul || '-'}`;
      const tshStr = l.tsh_uiuml !== null ? `${l.tsh_uiuml}` : '--';

      tbody.innerHTML += `
        <tr>
          <td class="num">${l.timestamp}</td>
          <td class="num" style="font-weight:600; color:var(--accent-cyan);">${hba1cStr}</td>
          <td class="num">${glucoseStr}</td>
          <td class="num">${insulinStr}</td>
          <td class="num">${lipidsStr}</td>
          <td class="num">${liverStr}</td>
          <td class="num">${tshStr}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteLabResult(${l.id})">Del</button></td>
        </tr>
      `;
    });
  } catch (e) { console.error(e); }
}

function openNewLabResultModal() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('labDate').value = today;
  document.getElementById('labHba1c').value = '';
  document.getElementById('labGlucose').value = '';
  document.getElementById('labInsulin').value = '';
  document.getElementById('labCholesterol').value = '';
  document.getElementById('labTriglycerides').value = '';
  document.getElementById('labHdl').value = '';
  document.getElementById('labLdl').value = '';
  document.getElementById('labAlt').value = '';
  document.getElementById('labAst').value = '';
  document.getElementById('labTsh').value = '';
  document.getElementById('labNotes').value = '';
  document.getElementById('labResultModal').classList.add('open');
}

function closeLabResultModal() {
  document.getElementById('labResultModal').classList.remove('open');
}

async function handleSaveLabResult(event) {
  event.preventDefault();
  const ts = document.getElementById('labDate').value;
  const hba1c = parseFloat(document.getElementById('labHba1c').value) || null;
  const glucose = parseFloat(document.getElementById('labGlucose').value) || null;
  const insulin = parseFloat(document.getElementById('labInsulin').value) || null;
  const chol = parseFloat(document.getElementById('labCholesterol').value) || null;
  const trig = parseFloat(document.getElementById('labTriglycerides').value) || null;
  const hdl = parseFloat(document.getElementById('labHdl').value) || null;
  const ldl = parseFloat(document.getElementById('labLdl').value) || null;
  const alt = parseFloat(document.getElementById('labAlt').value) || null;
  const ast = parseFloat(document.getElementById('labAst').value) || null;
  const tsh = parseFloat(document.getElementById('labTsh').value) || null;
  const notes = document.getElementById('labNotes').value;

  try {
    const res = await fetch('/api/medications/labs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: ts,
        hba1c_pct: hba1c,
        fasting_glucose_mgdl: glucose,
        fasting_insulin_uiuml: insulin,
        total_cholesterol_mgdl: chol,
        triglycerides_mgdl: trig,
        hdl_mgdl: hdl,
        ldl_mgdl: ldl,
        alt_ul: alt,
        ast_ul: ast,
        tsh_uiuml: tsh,
        notes: notes
      })
    });
    if (res.ok) {
      closeLabResultModal();
      loadLabResultsTable();
    }
  } catch (e) { console.error(e); }
}

async function deleteLabResult(id) {
  if (!confirm('Delete lab blood work entry?')) return;
  await fetch(`/api/medications/labs/${id}`, { method: 'DELETE' });
  loadLabResultsTable();
}

function switchSettingsSection(sectionKey) {
  document.querySelectorAll('#settingsSubtabPills .pill-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#tab-settings .stg-section').forEach(sec => sec.style.display = 'none');

  if (sectionKey === 'devices') {
    if (document.getElementById('btnStgDevices')) document.getElementById('btnStgDevices').classList.add('active');
    if (document.getElementById('stgSecDevices')) document.getElementById('stgSecDevices').style.display = 'block';
  } else if (sectionKey === 'profile') {
    if (document.getElementById('btnStgProfile')) document.getElementById('btnStgProfile').classList.add('active');
    if (document.getElementById('stgSecProfile')) document.getElementById('stgSecProfile').style.display = 'block';
  } else if (sectionKey === 'security') {
    if (document.getElementById('btnStgSecurity')) document.getElementById('btnStgSecurity').classList.add('active');
    if (document.getElementById('stgSecSecurity')) document.getElementById('stgSecSecurity').style.display = 'block';
  } else if (sectionKey === 'data') {
    if (document.getElementById('btnStgData')) document.getElementById('btnStgData').classList.add('active');
    if (document.getElementById('stgSecData')) document.getElementById('stgSecData').style.display = 'block';
  } else if (sectionKey === 'preferences') {
    if (document.getElementById('btnStgPreferences')) document.getElementById('btnStgPreferences').classList.add('active');
    if (document.getElementById('stgSecPreferences')) document.getElementById('stgSecPreferences').style.display = 'block';
  }
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const curPw = document.getElementById('changeCurrentPassword').value;
  const newPw = document.getElementById('changeNewPassword').value;
  const confirmPw = document.getElementById('changeConfirmPassword').value;

  if (newPw !== confirmPw) {
    alert('New password and confirmation do not match.');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: curPw, new_password: newPw })
    });
    if (res.ok) {
      document.getElementById('changeCurrentPassword').value = '';
      document.getElementById('changeNewPassword').value = '';
      document.getElementById('changeConfirmPassword').value = '';
      alert('Application password updated successfully!');
    } else {
      const err = await res.json();
      alert('Failed to change password: ' + (err.detail || 'Error'));
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleSavePreferences(event) {
  event.preventDefault();
  const symbol = document.getElementById('currencySymbolInput').value;
  try {
    const res = await fetch('/api/analytics/settings/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency_symbol: symbol })
    });
    if (res.ok) {
      alert('Preferences saved successfully');
      loadFinancialStats();
    }
  } catch (e) {
    console.error(e);
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
  try {
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
      const err = await res.json().catch(() => ({ detail: 'HTTP ' + res.status }));
      alert('Login Error: ' + (err.detail || ('HTTP ' + res.status)));
    }
  } catch (e) {
    console.error(e);
    alert('Network Error during login: ' + e.message);
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

// --- PROGRESS PHOTOS & BEFORE/AFTER COMPARISON MODULE ---

state.photos = [];
state.photoAngleFilter = 'All';
state.photoSubtab = 'gallery';
state.compareIdA = null;
state.compareIdB = null;
state.cmpMode = 'slider';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadPhotos() {
  try {
    let url = '/api/photos';
    if (state.photoAngleFilter && state.photoAngleFilter !== 'All') {
      url += '?angle=' + encodeURIComponent(state.photoAngleFilter);
    }
    const res = await fetch(url);
    if (!res.ok) return;
    state.photos = await res.json();

    renderPhotoGallery();
    populateCompareDropdowns();
    if (state.photoSubtab === 'compare') {
      updateBeforeAfterComparison();
    }
  } catch (e) {
    console.error('Error loading progress photos:', e);
  }
}

function filterPhotoAngle(angle) {
  state.photoAngleFilter = angle;
  document.querySelectorAll('#photoAnglePills .pill-btn').forEach(btn => {
    const text = btn.innerText.trim();
    btn.classList.toggle('active', text === angle || (angle === 'All' && text.includes('All')));
  });
  loadPhotos();
}

function switchPhotoSubtab(subtab) {
  state.photoSubtab = subtab;
  const btnGallery = document.getElementById('btnPhotoSubtabGallery');
  const btnCompare = document.getElementById('btnPhotoSubtabCompare');
  const galleryView = document.getElementById('photosGalleryView');
  const compareView = document.getElementById('photosCompareView');
  const filterBar = document.getElementById('photoGalleryFilterBar');

  if (subtab === 'gallery') {
    if (btnGallery) btnGallery.classList.add('active');
    if (btnCompare) btnCompare.classList.remove('active');
    if (galleryView) galleryView.style.display = 'block';
    if (compareView) compareView.style.display = 'none';
    if (filterBar) filterBar.style.display = 'flex';
  } else {
    if (btnCompare) btnCompare.classList.add('active');
    if (btnGallery) btnGallery.classList.remove('active');
    if (galleryView) galleryView.style.display = 'none';
    if (compareView) compareView.style.display = 'block';
    if (filterBar) filterBar.style.display = 'none';

    updateBeforeAfterComparison();
    setTimeout(initSplitSliderEvents, 50);
  }
}

function renderPhotoGallery() {
  const photoGrid = document.getElementById('photoGrid');
  const emptyState = document.getElementById('photoGridEmpty');
  const countLabel = document.getElementById('photoCountLabel');

  if (countLabel) countLabel.innerText = `${state.photos.length} photo${state.photos.length !== 1 ? 's' : ''}`;

  if (!state.photos || state.photos.length === 0) {
    if (photoGrid) photoGrid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (photoGrid) photoGrid.style.display = 'grid';

  const sortedByDateAsc = [...state.photos].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const earliestDate = sortedByDateAsc.length > 0 ? sortedByDateAsc[0].timestamp : null;
  const baselinePhotoWithWeight = sortedByDateAsc.find(p => p.weight_kg !== null && p.weight_kg !== undefined);
  const baselineWeight = baselinePhotoWithWeight ? baselinePhotoWithWeight.weight_kg : null;

  photoGrid.innerHTML = state.photos.map(p => {
    const angleLower = (p.angle || 'front').toLowerCase().replace(/\s+/g, '-');
    const angleClass = `badge-angle-${angleLower}`;
    
    let weightDiffHtml = '';
    const isBaselineDate = (p.timestamp === earliestDate);

    if (isBaselineDate) {
      weightDiffHtml = `<span style="font-size: 10px; color: var(--accent-cyan); font-weight: 600;">Baseline Date</span>`;
    } else if (p.weight_kg !== null && p.weight_kg !== undefined && baselineWeight !== null) {
      const diff = p.weight_kg - baselineWeight;
      const sign = diff > 0 ? '+' : '';
      const color = diff <= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)';
      weightDiffHtml = `<span style="font-size: 11px; color: ${color}; font-weight: 600; font-family: var(--font-mono);">${sign}${diff.toFixed(1)} kg vs start</span>`;
    }

    const weightDisplay = (p.weight_kg !== null && p.weight_kg !== undefined) ? `${p.weight_kg} kg` : 'No weight tag';

    return `
      <div class="photo-card">
        <div class="photo-badge-group">
          <span class="badge badge-angle ${angleClass}">${escapeHtml(p.angle || 'Front')}</span>
          <span class="badge badge-date">${escapeHtml(p.timestamp)}</span>
        </div>
        <div class="badge-weight">${weightDisplay}</div>
        <div class="photo-img-wrapper" onclick="openLightbox('${p.image_path}', '${escapeHtml(p.timestamp)} | ${escapeHtml(p.angle)} | ${weightDisplay}', ${p.id})">
          <img src="${p.image_path}" class="photo-img" alt="${escapeHtml(p.angle)} photo from ${escapeHtml(p.timestamp)}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--accent-rose);font-size:11px;padding:12px;text-align:center;background:#111;\'>⚠️ Image lost on container restart.<br><br>Please delete & re-upload.</div>';">
        </div>
        <div class="photo-info">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: var(--text-main); font-size: 13px;">${escapeHtml(p.timestamp)}</strong>
            ${weightDiffHtml}
          </div>
          ${p.notes ? `<div class="photo-notes">${escapeHtml(p.notes)}</div>` : ''}
          <div class="photo-actions">
            <button class="btn btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="selectPhotoForCompare(${p.id})">
              ⚖️ Compare
            </button>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="openPhotoEditModal(${p.id})">✏️ Edit</button>
              <button class="btn btn-sm" style="font-size: 11px; padding: 2px 8px; color: var(--accent-rose);" onclick="deletePhoto(${p.id})">🗑️ Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function selectPhotoForCompare(photoId) {
  if (!state.compareIdA || state.compareIdA === photoId) {
    state.compareIdA = photoId;
  } else {
    state.compareIdB = photoId;
  }
  switchPhotoSubtab('compare');
}

function populateCompareDropdowns() {
  const selectA = document.getElementById('compareSelectA');
  const selectB = document.getElementById('compareSelectB');
  if (!selectA || !selectB) return;

  const sortedAsc = [...state.photos].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (sortedAsc.length === 0) {
    selectA.innerHTML = '<option value="">No photos uploaded</option>';
    selectB.innerHTML = '<option value="">No photos uploaded</option>';
    return;
  }

  const optionsHtml = sortedAsc.map(p => {
    const wt = (p.weight_kg !== null && p.weight_kg !== undefined) ? `${p.weight_kg}kg` : 'No weight';
    return `<option value="${p.id}">${p.timestamp} — ${p.angle} (${wt})</option>`;
  }).join('');

  selectA.innerHTML = optionsHtml;
  selectB.innerHTML = optionsHtml;

  if (!state.compareIdA || !state.photos.find(p => p.id === state.compareIdA)) {
    state.compareIdA = sortedAsc[0].id;
  }
  if (!state.compareIdB || !state.photos.find(p => p.id === state.compareIdB)) {
    state.compareIdB = sortedAsc[sortedAsc.length - 1].id;
  }

  selectA.value = state.compareIdA;
  selectB.value = state.compareIdB;
}

function updateBeforeAfterComparison() {
  const selectA = document.getElementById('compareSelectA');
  const selectB = document.getElementById('compareSelectB');
  if (selectA) state.compareIdA = parseInt(selectA.value);
  if (selectB) state.compareIdB = parseInt(selectB.value);

  const photoA = state.photos.find(p => p.id === state.compareIdA);
  const photoB = state.photos.find(p => p.id === state.compareIdB);

  if (!photoA || !photoB) return;

  const dateA = new Date(photoA.timestamp);
  const dateB = new Date(photoB.timestamp);
  const diffTime = Math.abs(dateB - dateA);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const wtA = photoA.weight_kg;
  const wtB = photoB.weight_kg;

  let weightDiffText = '--';
  let weightRangeText = '--';
  let lossRateText = '--';

  if (wtA !== null && wtB !== null && wtA !== undefined && wtB !== undefined) {
    const diffWt = wtB - wtA;
    const sign = diffWt > 0 ? '+' : '';
    weightDiffText = `${sign}${diffWt.toFixed(1)} kg`;
    weightRangeText = `${wtA} kg ➔ ${wtB} kg`;

    if (diffDays > 0) {
      const weeklyRate = (diffWt / (diffDays / 7)).toFixed(2);
      lossRateText = `${weeklyRate} kg/wk`;
    }
  }

  const kpiWeightDiff = document.getElementById('cmpKpiWeightDiff');
  const kpiWeightRange = document.getElementById('cmpKpiWeightRange');
  const kpiDays = document.getElementById('cmpKpiDays');
  const kpiDateRange = document.getElementById('cmpKpiDateRange');
  const kpiRate = document.getElementById('cmpKpiRate');
  const kpiAngle = document.getElementById('cmpKpiAngle');
  const kpiAngleSub = document.getElementById('cmpKpiAngleSub');

  if (kpiWeightDiff) {
    kpiWeightDiff.innerText = weightDiffText;
    if (wtA !== null && wtB !== null) {
      const isLoss = (wtB - wtA) <= 0;
      kpiWeightDiff.style.color = isLoss ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    }
  }
  if (kpiWeightRange) kpiWeightRange.innerText = weightRangeText;
  if (kpiDays) kpiDays.innerText = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  if (kpiDateRange) kpiDateRange.innerText = `${photoA.timestamp} ➔ ${photoB.timestamp}`;
  if (kpiRate) kpiRate.innerText = lossRateText;
  if (kpiAngle) kpiAngle.innerText = `${photoA.angle} / ${photoB.angle}`;
  if (kpiAngleSub) kpiAngleSub.innerText = photoA.angle === photoB.angle ? '🎯 Matching camera angles' : '⚠️ Different camera angles';

  const baImgBefore = document.getElementById('baImgBefore');
  const baImgAfter = document.getElementById('baImgAfter');

  if (baImgBefore) baImgBefore.src = photoA.image_path;
  if (baImgAfter) baImgAfter.src = photoB.image_path;

  const sideBeforeHeader = document.getElementById('sideBeforeHeader');
  const sideBeforeImg = document.getElementById('sideBeforeImg');
  const sideBeforeSub = document.getElementById('sideBeforeSub');

  const sideAfterHeader = document.getElementById('sideAfterHeader');
  const sideAfterImg = document.getElementById('sideAfterImg');
  const sideAfterSub = document.getElementById('sideAfterSub');

  if (sideBeforeHeader) sideBeforeHeader.innerText = `BEFORE: ${photoA.timestamp} (${photoA.angle})`;
  if (sideBeforeImg) sideBeforeImg.src = photoA.image_path;
  if (sideBeforeSub) sideBeforeSub.innerText = `Weight: ${photoA.weight_kg !== null ? photoA.weight_kg + ' kg' : 'N/A'} ${photoA.notes ? '| ' + photoA.notes : ''}`;

  if (sideAfterHeader) sideAfterHeader.innerText = `AFTER: ${photoB.timestamp} (${photoB.angle})`;
  if (sideAfterImg) sideAfterImg.src = photoB.image_path;
  if (sideAfterSub) sideAfterSub.innerText = `Weight: ${photoB.weight_kg !== null ? photoB.weight_kg + ' kg' : 'N/A'} ${photoB.notes ? '| ' + photoB.notes : ''}`;
}

function swapBeforeAfterPhotos() {
  const selectA = document.getElementById('compareSelectA');
  const selectB = document.getElementById('compareSelectB');
  if (!selectA || !selectB) return;
  const temp = selectA.value;
  selectA.value = selectB.value;
  selectB.value = temp;
  updateBeforeAfterComparison();
}

function autoSelectSameAngleCompare() {
  const frontPhotos = state.photos.filter(p => (p.angle || '').toLowerCase() === 'front');
  if (frontPhotos.length < 2) {
    alert('You need at least 2 Front angle photos to auto-match.');
    return;
  }
  const sorted = [...frontPhotos].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  state.compareIdA = sorted[0].id;
  state.compareIdB = sorted[sorted.length - 1].id;

  populateCompareDropdowns();
  updateBeforeAfterComparison();
}

function setCmpMode(mode) {
  state.cmpMode = mode;
  const btnSlider = document.getElementById('btnCmpModeSlider');
  const btnSide = document.getElementById('btnCmpModeSide');
  const viewSlider = document.getElementById('cmpViewSlider');
  const viewSide = document.getElementById('cmpViewSide');

  if (mode === 'slider') {
    if (btnSlider) btnSlider.classList.add('active');
    if (btnSide) btnSide.classList.remove('active');
    if (viewSlider) viewSlider.style.display = 'block';
    if (viewSide) viewSide.style.display = 'none';
    setTimeout(initSplitSliderEvents, 50);
  } else {
    if (btnSide) btnSide.classList.add('active');
    if (btnSlider) btnSlider.classList.remove('active');
    if (viewSlider) viewSlider.style.display = 'none';
    if (viewSide) viewSide.style.display = 'grid';
    state.cmpMode = 'side';
  }
}

let isBaDragging = false;

function initSplitSliderEvents() {
  const container = document.getElementById('baSliderContainer');
  const handle = document.getElementById('baHandle');
  const overlay = document.getElementById('baOverlay');
  const imgBefore = document.getElementById('baImgBefore');
  if (!container || !handle || !overlay) return;

  function syncImageWidth() {
    if (imgBefore && container && container.offsetWidth > 0) {
      imgBefore.style.width = container.offsetWidth + 'px';
      imgBefore.style.maxWidth = container.offsetWidth + 'px';
    }
  }

  syncImageWidth();
  window.addEventListener('resize', syncImageWidth);

  function setSliderPos(clientX) {
    syncImageWidth();
    const rect = container.getBoundingClientRect();
    let x = clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;

    const pct = (x / rect.width) * 100;
    overlay.style.width = pct + '%';
    handle.style.left = pct + '%';
  }

  handle.onmousedown = (e) => {
    isBaDragging = true;
    e.preventDefault();
  };

  container.onmousedown = (e) => {
    isBaDragging = true;
    setSliderPos(e.clientX);
  };

  window.onmousemove = (e) => {
    if (!isBaDragging) return;
    setSliderPos(e.clientX);
  };

  window.onmouseup = () => {
    isBaDragging = false;
  };

  handle.ontouchstart = (e) => {
    isBaDragging = true;
  };

  container.ontouchstart = (e) => {
    isBaDragging = true;
    if (e.touches && e.touches[0]) setSliderPos(e.touches[0].clientX);
  };

  window.ontouchmove = (e) => {
    if (!isBaDragging) return;
    if (e.touches && e.touches[0]) setSliderPos(e.touches[0].clientX);
  };

  window.ontouchend = () => {
    isBaDragging = false;
  };
}

function openPhotoUploadModal() {
  const modal = document.getElementById('photoUploadModal');
  if (!modal) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  document.getElementById('photoDate').value = todayStr;
  document.getElementById('photoWeight').value = '';
  document.getElementById('photoAngle').value = 'Front';
  document.getElementById('photoFileInput').value = '';
  document.getElementById('photoNotes').value = '';
  document.getElementById('photoPreviewBox').style.display = 'none';

  autoFetchWeightForDate(todayStr);
  modal.classList.add('open');
}

function closePhotoUploadModal() {
  const modal = document.getElementById('photoUploadModal');
  if (modal) modal.classList.remove('open');
}

function previewPhotoFile(event) {
  const file = event.target.files[0];
  const box = document.getElementById('photoPreviewBox');
  const img = document.getElementById('photoPreviewImg');
  if (file && box && img) {
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      box.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
}

async function autoFetchWeightForDate(dateStr) {
  if (!dateStr) return;
  try {
    const res = await fetch(`/api/measurements?start_date=${dateStr}&end_date=${dateStr}`);
    if (!res.ok) return;
    const items = await res.json();
    if (items && items.length > 0) {
      const latest = items[0];
      if (latest.data && latest.data.weight_kg !== undefined) {
        document.getElementById('photoWeight').value = latest.data.weight_kg;
        const hint = document.getElementById('photoWeightHint');
        if (hint) hint.innerText = `✓ Auto-filled ${latest.data.weight_kg} kg from ${latest.scale_name || 'logged scale'}`;
      }
    } else {
      const hint = document.getElementById('photoWeightHint');
      if (hint) hint.innerText = `No scale measurement recorded on ${dateStr}`;
    }
  } catch (e) {
    console.error('Error fetching weight for date:', e);
  }
}

function fetchWeightForSelectedDate() {
  const dateVal = document.getElementById('photoDate').value;
  if (dateVal) autoFetchWeightForDate(dateVal);
}

async function handleSavePhotoUpload(event) {
  event.preventDefault();
  const fileInput = document.getElementById('photoFileInput');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select an image file to upload.');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('timestamp', document.getElementById('photoDate').value);
  formData.append('weight_kg', document.getElementById('photoWeight').value);
  formData.append('angle', document.getElementById('photoAngle').value);
  formData.append('notes', document.getElementById('photoNotes').value);

  const btn = document.getElementById('photoSubmitBtn');
  if (btn) { btn.disabled = true; btn.innerText = 'Uploading...'; }

  try {
    const res = await fetch('/api/photos', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      closePhotoUploadModal();
      await loadPhotos();
      alert('Progress photo uploaded successfully!');
    } else {
      const err = await res.json();
      alert('Upload failed: ' + (err.detail || 'Error uploading file'));
    }
  } catch (e) {
    console.error(e);
    alert('An error occurred during photo upload.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = 'Upload Photo'; }
  }
}

async function fetchWeightForEditDate() {
  const dateVal = document.getElementById('editPhotoDate').value;
  if (!dateVal) return;
  try {
    const res = await fetch(`/api/measurements?start_date=${dateVal}&end_date=${dateVal}`);
    if (!res.ok) return;
    const items = await res.json();
    const hint = document.getElementById('editPhotoWeightHint');
    if (items && items.length > 0) {
      const latest = items[0];
      if (latest.data && latest.data.weight_kg !== undefined) {
        document.getElementById('editPhotoWeight').value = latest.data.weight_kg;
        if (hint) hint.innerText = `✓ Auto-filled ${latest.data.weight_kg} kg from ${latest.scale_name || 'logged scale'}`;
      }
    } else {
      if (hint) hint.innerText = `No scale measurement recorded on ${dateVal}`;
    }
  } catch (e) {
    console.error('Error fetching weight for edit date:', e);
  }
}

function openPhotoEditModal(photoId) {
  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;
  document.getElementById('editPhotoId').value = photo.id;
  document.getElementById('editPhotoDate').value = photo.timestamp;
  document.getElementById('editPhotoWeight').value = photo.weight_kg !== null ? photo.weight_kg : '';
  document.getElementById('editPhotoAngle').value = photo.angle || 'Front';
  document.getElementById('editPhotoNotes').value = photo.notes || '';

  const hint = document.getElementById('editPhotoWeightHint');
  if (hint) hint.innerText = 'Click fetch to auto-fill scale measurement from that day';

  if (photo.weight_kg === null || photo.weight_kg === undefined) {
    fetchWeightForEditDate();
  }

  const modal = document.getElementById('photoEditModal');
  if (modal) modal.classList.add('open');
}

function closePhotoEditModal() {
  const modal = document.getElementById('photoEditModal');
  if (modal) modal.classList.remove('open');
}

async function handleSavePhotoEdit(event) {
  event.preventDefault();
  const photoId = document.getElementById('editPhotoId').value;
  const payload = {
    timestamp: document.getElementById('editPhotoDate').value,
    weight_kg: document.getElementById('editPhotoWeight').value ? parseFloat(document.getElementById('editPhotoWeight').value) : null,
    angle: document.getElementById('editPhotoAngle').value,
    notes: document.getElementById('editPhotoNotes').value
  };

  try {
    const res = await fetch(`/api/photos/${photoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closePhotoEditModal();
      await loadPhotos();
    } else {
      alert('Failed to update photo details.');
    }
  } catch (e) {
    console.error(e);
  }
}

let currentLightboxPhotoId = null;

function openLightbox(imgUrl, captionText, photoId = null) {
  const modal = document.getElementById('photoLightboxModal');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  const delBtn = document.getElementById('lightboxDeleteBtn');
  currentLightboxPhotoId = photoId;

  if (modal && img) {
    img.src = imgUrl;
    if (cap) cap.innerText = captionText || '';
    if (delBtn) delBtn.style.display = photoId ? 'inline-block' : 'none';
    modal.classList.add('open');
  }
}

function closeLightbox(event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById('photoLightboxModal');
  if (modal) modal.classList.remove('open');
  currentLightboxPhotoId = null;
}

async function deleteLightboxPhoto(event) {
  if (event) event.stopPropagation();
  if (!currentLightboxPhotoId) return;
  const pId = currentLightboxPhotoId;
  closeLightbox();
  await deletePhoto(pId);
}

async function deleteCurrentEditPhoto() {
  const photoId = document.getElementById('editPhotoId').value;
  if (!photoId) return;
  closePhotoEditModal();
  await deletePhoto(parseInt(photoId));
}

async function deletePhoto(photoId) {
  if (!confirm('Are you sure you want to delete this progress photo?')) return;
  try {
    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadPhotos();
      alert('Progress photo deleted successfully.');
    } else {
      const err = await res.json();
      alert('Delete failed: ' + (err.detail || 'Failed to delete photo'));
    }
  } catch (e) {
    console.error(e);
    alert('An error occurred while deleting the photo.');
  }
}
