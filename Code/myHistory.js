// ═══════════════════════════════════════════════════════════════
//  myHistory.js — Weight + Exercise history charts
// ═══════════════════════════════════════════════════════════════

let weightChart = null;
let exerciseChart = null;
let currentExerciseType = 'running';
let currentExerciseDays = 7;

// ——— Initialize on page load ———
document.addEventListener('DOMContentLoaded', () => {
    setupRangeButtons();
    setupCustomDateDefaults();
    loadWeightData(7);
    loadExerciseData('running', 7);
});

// ═══════════════════════════════════════════════════════════════
//  Range button click handlers (works for both sections)
// ═══════════════════════════════════════════════════════════════

function setupRangeButtons() {
    const buttons = document.querySelectorAll('.range-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            const range = btn.dataset.range;

            // Remove active from same section's buttons only
            document.querySelectorAll(`.range-btn[data-section="${section}"]`)
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (section === 'weight') {
                if (range === 'custom') {
                    document.getElementById('weightCustomRange').style.display = 'block';
                } else {
                    document.getElementById('weightCustomRange').style.display = 'none';
                    loadWeightData(Number(range));
                }
            } else if (section === 'exercise') {
                if (range === 'custom') {
                    document.getElementById('exerciseCustomRange').style.display = 'block';
                } else {
                    document.getElementById('exerciseCustomRange').style.display = 'none';
                    currentExerciseDays = Number(range);
                    loadExerciseData(currentExerciseType, currentExerciseDays);
                }
            }
        });
    });
}

function setupCustomDateDefaults() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const formatted = (d) => d.toISOString().split('T')[0];

    document.getElementById('weightDateTo').value = formatted(today);
    document.getElementById('weightDateFrom').value = formatted(thirtyDaysAgo);
    document.getElementById('exerciseDateTo').value = formatted(today);
    document.getElementById('exerciseDateFrom').value = formatted(thirtyDaysAgo);
}

function applyWeightCustomRange() {
    const from = document.getElementById('weightDateFrom').value;
    const to = document.getElementById('weightDateTo').value;
    if (!from || !to) return alert('Please select both dates.');
    if (new Date(from) > new Date(to)) return alert('Start date must be before end date.');
    loadWeightDataCustom(from, to);
}

function applyExerciseCustomRange() {
    const from = document.getElementById('exerciseDateFrom').value;
    const to = document.getElementById('exerciseDateTo').value;
    if (!from || !to) return alert('Please select both dates.');
    if (new Date(from) > new Date(to)) return alert('Start date must be before end date.');
    loadExerciseDataCustom(currentExerciseType, from, to);
}

// ═══════════════════════════════════════════════════════════════
//  Exercise type selector
// ═══════════════════════════════════════════════════════════════

function selectExerciseType(type, btn) {
    document.querySelectorAll('.exercise-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentExerciseType = type;

    // Update metric label
    const labelEl = document.getElementById('exerciseMetricLabel');
    if (type === 'gym') {
        labelEl.textContent = 'Weight moved (kg) over time';
    } else {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        labelEl.textContent = `Distance ${type === 'swimming' ? 'swum' : type === 'running' ? 'ran' : type === 'walking' ? 'walked' : 'cycled'} (km) over time`;
    }

    loadExerciseData(type, currentExerciseDays);
}

// ═══════════════════════════════════════════════════════════════
//  Section 1: Weight data
// ═══════════════════════════════════════════════════════════════

async function loadWeightData(days) {
    try {
        const res = await fetch(`/api/weight-history?days=${days}`, { credentials: 'same-origin' });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        const data = await res.json();
        renderWeightChart(data.entries || []);
        updateWeightStats(data.entries || []);
    } catch (err) { console.error('Error loading weight data:', err); }
}

async function loadWeightDataCustom(from, to) {
    try {
        const res = await fetch(`/api/weight-history?from=${from}&to=${to}`, { credentials: 'same-origin' });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        const data = await res.json();
        renderWeightChart(data.entries || []);
        updateWeightStats(data.entries || []);
    } catch (err) { console.error('Error loading weight data:', err); }
}

function renderWeightChart(entries) {
    const canvas = document.getElementById('weightChart');
    const emptyState = document.getElementById('weightEmptyState');
    const chartWrapper = canvas.parentElement;

    if (entries.length === 0) {
        emptyState.style.display = 'block';
        chartWrapper.style.display = 'none';
        document.getElementById('weightStatsRow').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    chartWrapper.style.display = 'block';
    document.getElementById('weightStatsRow').style.display = 'grid';

    const labels = entries.map(e => new Date(e.log_date));
    const weights = entries.map(e => Number(e.weight_kg));

    if (weightChart) weightChart.destroy();

    weightChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: weights,
                borderColor: '#1a6b3c',
                backgroundColor: 'rgba(26, 107, 60, 0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#1a6b3c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: buildChartOptions(weights, 'kg')
    });
}

function updateWeightStats(entries) {
    if (entries.length === 0) return;
    const first = Number(entries[0].weight_kg);
    const last = Number(entries[entries.length - 1].weight_kg);
    const change = last - first;

    document.getElementById('currentWeight').textContent = last.toFixed(1) + ' kg';
    document.getElementById('statStart').textContent = first.toFixed(1) + ' kg';
    document.getElementById('statCurrent').textContent = last.toFixed(1) + ' kg';
    document.getElementById('statEntries').textContent = entries.length;

    const changeEl = document.getElementById('statChange');
    changeEl.textContent = (change > 0 ? '+' : '') + change.toFixed(1) + ' kg';
    changeEl.classList.remove('positive', 'negative');
    if (change < 0) changeEl.classList.add('negative');
    else if (change > 0) changeEl.classList.add('positive');
}

// ═══════════════════════════════════════════════════════════════
//  Section 2: Exercise data
// ═══════════════════════════════════════════════════════════════

async function loadExerciseData(type, days) {
    try {
        const res = await fetch(`/api/exercise-history?type=${type}&days=${days}`, { credentials: 'same-origin' });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        const data = await res.json();
        renderExerciseChart(data.entries || [], type);
        updateExerciseStats(data.entries || [], type);
    } catch (err) { console.error('Error loading exercise data:', err); }
}

async function loadExerciseDataCustom(type, from, to) {
    try {
        const res = await fetch(`/api/exercise-history?type=${type}&from=${from}&to=${to}`, { credentials: 'same-origin' });
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        const data = await res.json();
        renderExerciseChart(data.entries || [], type);
        updateExerciseStats(data.entries || [], type);
    } catch (err) { console.error('Error loading exercise data:', err); }
}

function renderExerciseChart(entries, type) {
    const canvas = document.getElementById('exerciseChart');
    const emptyState = document.getElementById('exerciseEmptyState');
    const chartWrapper = canvas.parentElement;

    if (entries.length === 0) {
        emptyState.style.display = 'block';
        chartWrapper.style.display = 'none';
        document.getElementById('exerciseStatsRow').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    chartWrapper.style.display = 'block';
    document.getElementById('exerciseStatsRow').style.display = 'grid';

    const isGym = type === 'gym';
    const labels = entries.map(e => new Date(e.log_date));
    const values = entries.map(e => Number(isGym ? e.weight_moved_kg || 0 : e.distance_km || 0));
    const unit = isGym ? 'kg' : 'km';
    const label = isGym ? 'Weight Moved (kg)' : 'Distance (km)';

    if (exerciseChart) exerciseChart.destroy();

    exerciseChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: values,
                borderColor: '#1a6b3c',
                backgroundColor: 'rgba(26, 107, 60, 0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#1a6b3c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: buildChartOptions(values, unit)
    });
}

function updateExerciseStats(entries, type) {
    const isGym = type === 'gym';
    const unit = isGym ? 'kg' : 'km';
    const values = entries.map(e => Number(isGym ? e.weight_moved_kg || 0 : e.distance_km || 0));
    const totalDuration = entries.reduce((sum, e) => sum + (Number(e.duration_min) || 0), 0);

    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = entries.length > 0 ? total / entries.length : 0;

    document.getElementById('exStatTotal').textContent = total.toFixed(1) + ' ' + unit;
    document.getElementById('exStatSessions').textContent = entries.length;
    document.getElementById('exStatAvg').textContent = avg.toFixed(1) + ' ' + unit;
    document.getElementById('exStatDuration').textContent = totalDuration + ' min';
}

// ═══════════════════════════════════════════════════════════════
//  Shared chart options builder
// ═══════════════════════════════════════════════════════════════

function buildChartOptions(values, unit) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0e1a12',
                titleColor: '#fff',
                bodyColor: '#fff',
                titleFont: { weight: '700', size: 13 },
                bodyFont: { weight: '600', size: 14 },
                padding: 12,
                cornerRadius: 10,
                displayColors: false,
                callbacks: {
                    title: function(context) {
                        const date = new Date(context[0].parsed.x);
                        return date.toLocaleDateString('en-GB', {
                            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                        });
                    },
                    label: function(context) {
                        return context.parsed.y.toFixed(1) + ' ' + unit;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: getTimeUnit(values.length, values),
                    displayFormats: { day: 'd MMM', week: 'd MMM', month: 'MMM yyyy' },
                    tooltipFormat: 'dd MMM yyyy'
                },
                grid: { display: false },
                ticks: { color: '#6b7c6e', font: { size: 12, weight: '600' }, maxTicksLimit: 8 }
            },
            y: {
                grid: { color: 'rgba(0, 0, 0, 0.04)', drawBorder: false },
                ticks: {
                    color: '#6b7c6e',
                    font: { size: 12, weight: '600' },
                    callback: function(value) { return value.toFixed(1) + ' ' + unit; }
                },
                suggestedMin: values.length > 0 ? Math.min(...values) * 0.9 : 0,
                suggestedMax: values.length > 0 ? Math.max(...values) * 1.1 : 10
            }
        }
    };
}

function getTimeUnit(count, values) {
    // Simple heuristic based on number of data points
    if (count <= 14) return 'day';
    if (count <= 60) return 'week';
    return 'month';
}
