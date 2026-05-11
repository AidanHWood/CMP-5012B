// ─────────────────────────────────────────────
//  GOAL CONFIG — smart detection for any goal type
// ─────────────────────────────────────────────

function getGoalConfig(goalType) {
    const known = {
        calorie_intake:        { unit: 'kcal', isTime: false, icon: '🔥', isDistance: false },
        calories:              { unit: 'kcal', isTime: false, icon: '🔥', isDistance: false },
        steps:                 { unit: 'steps', isTime: false, icon: '👟', isDistance: false },
        water:                 { unit: 'ml', isTime: false, icon: '💧', isDistance: false },
        weight_loss:           { unit: 'kg', isTime: false, icon: '⚖️', isDistance: false },
        gym_weight_moved_week: { unit: 'kg', isTime: false, icon: '🏋️', isDistance: false },
    };
    if (known[goalType]) return known[goalType];

    if (goalType.includes('_sessions_week')) return { unit: 'sessions', isTime: false, icon: '📅', isDistance: false };
    if (goalType.includes('_distance_week')) return { unit: 'km', isTime: false, icon: '📏', isDistance: true };
    if (goalType.includes('_time_'))         return { unit: '', isTime: true, icon: '⏱️', isDistance: false };

    if (goalType.includes('running'))  return { unit: '', isTime: false, icon: '🏃', isDistance: false };
    if (goalType.includes('swimming')) return { unit: '', isTime: false, icon: '🏊', isDistance: false };
    if (goalType.includes('cycling'))  return { unit: '', isTime: false, icon: '🚴', isDistance: false };
    if (goalType.includes('walking'))  return { unit: '', isTime: false, icon: '🚶', isDistance: false };
    if (goalType.includes('gym'))      return { unit: 'kg', isTime: false, icon: '🏋️', isDistance: false };

    return { unit: '', isTime: false, icon: '🎯', isDistance: false };
}

function getExerciseIcon(type) {
    if (type.includes('running'))  return '🏃';
    if (type.includes('swimming')) return '🏊';
    if (type.includes('cycling'))  return '🚴';
    if (type.includes('walking'))  return '🚶';
    if (type.includes('gym'))      return '🏋️';
    return '🎯';
}

function getExerciseName(goalType) {
    const parts = goalType.split('_');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function _pct(actual, goal) {
    if (!goal) return 0;
    return Math.min(100, Math.round((actual / goal) * 100));
}

function _secToTime(s) {
    s = Number(s) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function _timeToSec(str) {
    if (!str) return 0;
    const parts = str.replace('.', ':').split(':').map(Number);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    return (parts[0] || 0) * 60;
}

function formatGoalName(goalType) {
    return goalType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Convert distance stored as ×10 back to km
function displayDistance(val) {
    return (val / 10).toFixed(1);
}

// ─────────────────────────────────────────────
//  CHART INSTANCES
// ─────────────────────────────────────────────
let caloriesPieChart, macrosPieChart, caloriesLineChart, weeklyBarChart;

function initCharts() {
    caloriesPieChart = new Chart(document.getElementById('caloriesPie'), {
        type: 'doughnut',
        data: {
            labels: ['Consumed', 'Remaining'],
            datasets: [{
                data: [0, 2000],
                backgroundColor: ['#1a6b3c', 'rgba(168,224,99,0.45)'],
                borderColor: ['rgba(247,244,239,0.9)', 'rgba(247,244,239,0.9)'],
                borderWidth: 3, hoverOffset: 6,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: { legend: { display: true, position: 'bottom', labels: { color: '#6b7c6e', boxWidth: 12, padding: 16, font: { size: 12, weight: '600' } } } },
        },
    });

    macrosPieChart = new Chart(document.getElementById('macrosPie'), {
        type: 'doughnut',
        data: {
            labels: ['Protein', 'Carbs', 'Fibre'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#1a6b3c', '#2d9156', '#a8e063'],
                borderColor: ['rgba(247,244,239,0.9)', 'rgba(247,244,239,0.9)', 'rgba(247,244,239,0.9)'],
                borderWidth: 3, hoverOffset: 6,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: { legend: { display: true, position: 'bottom', labels: { color: '#6b7c6e', boxWidth: 12, padding: 16, font: { size: 12, weight: '600' } } } },
        },
    });

    caloriesLineChart = new Chart(document.getElementById('caloriesLine'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Calories', data: [], borderColor: '#1a6b3c', backgroundColor: 'rgba(26,107,60,0.12)', pointBackgroundColor: '#2d9156', pointBorderColor: '#f7f4ef', borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.35 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: '#6b7c6e' }, grid: { color: 'rgba(26,107,60,0.08)' } }, y: { ticks: { color: '#6b7c6e' }, grid: { color: 'rgba(26,107,60,0.08)' } } },
        },
    });

    weeklyBarChart = new Chart(document.getElementById('weeklyExerciseChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Calories Burned', data: [], backgroundColor: 'rgba(26,107,60,0.75)', borderColor: '#1a6b3c', borderWidth: 1, borderRadius: 10, borderSkipped: false }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0e1a12', titleColor: '#f7f4ef', bodyColor: '#f7f4ef', padding: 12, displayColors: false, callbacks: { label: ctx => ctx.parsed.y + ' calories burned' } } },
            scales: { x: { ticks: { color: '#6b7c6e', font: { weight: '600' } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#6b7c6e' }, grid: { color: 'rgba(26,107,60,0.08)' } } },
        },
    });
}

// ─────────────────────────────────────────────
//  POPULATE FUNCTIONS
// ─────────────────────────────────────────────
function populateStats(stats) {
    const cards = document.querySelectorAll('.stat-card');
    if (!cards.length) return;

    const eaten  = Number(stats.calories_eaten)  || 0;
    const burned = Number(stats.calories_burned) || 0;
    const net    = Number(stats.net_calories)    || 0;
    const goal   = Number(stats.calorie_goal)    || 2000;
    const streak = Number(stats.streak)          || 0;

    cards[0].querySelector('strong').textContent    = eaten.toLocaleString();
    cards[0].querySelector('.stat-sub').textContent = `of ${goal.toLocaleString()} goal`;
    cards[1].querySelector('strong').textContent    = burned.toLocaleString();
    cards[2].querySelector('strong').textContent    = net.toLocaleString();
    cards[3].querySelector('strong').textContent    = streak + (streak === 1 ? ' day' : ' days');

    caloriesPieChart.data.datasets[0].data = [eaten, Math.max(0, goal - eaten)];
    caloriesPieChart.update();

    const p = Number(stats.macros?.protein) || 0;
    const c = Number(stats.macros?.carbs)   || 0;
    const f = Number(stats.macros?.fibre)   || 0;
    macrosPieChart.data.datasets[0].data = [p, c, f];
    macrosPieChart.update();
}

function populateMealChart(meals) {
    if (!Array.isArray(meals) || !meals.length) return;
    let cumulative = 0;
    const labels = [], data = [];
    meals.forEach(m => {
        labels.push(m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1));
        cumulative += parseFloat(m.meal_calories) || 0;
        data.push(Math.round(cumulative));
    });
    caloriesLineChart.data.labels = labels;
    caloriesLineChart.data.datasets[0].data = data;
    caloriesLineChart.update();
}

function populateWeeklyChart(days) {
    if (!Array.isArray(days) || !days.length) return;
    weeklyBarChart.data.labels = days.map(d => d.label);
    weeklyBarChart.data.datasets[0].data = days.map(d => d.calories_burned);
    weeklyBarChart.update();
}

// ─────────────────────────────────────────────
//  GROUP GOALS BY EXERCISE TYPE
//  e.g. running_sessions_week, running_distance_week, running_time_5km
//  all go under one "Running" card with expandable sub-goals
// ─────────────────────────────────────────────

function groupGoals(goalsArr) {
    const exerciseTypes = ['running', 'swimming', 'cycling', 'walking', 'gym'];
    const groups = {};       // { running: [goal, goal, ...], swimming: [...] }
    const standalone = [];   // goals that don't belong to an exercise group

    for (const g of goalsArr) {
        let matched = false;
        for (const exType of exerciseTypes) {
            if (g.goal_type.startsWith(exType + '_')) {
                if (!groups[exType]) groups[exType] = [];
                groups[exType].push(g);
                matched = true;
                break;
            }
        }
        if (!matched) standalone.push(g);
    }

    return { groups, standalone };
}

function populateGoals(goalsArr) {
    const grid = document.getElementById('goals-grid');
    if (!grid) return;

    if (!goalsArr.length) {
        grid.innerHTML = '<div class="empty-state">No goals yet — set them during registration or in User Settings.</div>';
        return;
    }

    const { groups, standalone } = groupGoals(goalsArr);
    let html = '';

    // Render grouped exercise goals (one card per exercise type with dropdown)
    for (const [exType, goals] of Object.entries(groups)) {
        const icon = getExerciseIcon(exType);
        const name = exType.charAt(0).toUpperCase() + exType.slice(1);
        const cardId = `exercise-group-${exType}`;

        // Find sessions goal for the primary display
        const sessionsGoal = goals.find(g => g.goal_type.includes('_sessions_week'));
        const distanceGoal = goals.find(g => g.goal_type.includes('_distance_week'));
        const weightGoal = goals.find(g => g.goal_type.includes('_weight_moved'));
        const timeGoals = goals.filter(g => g.goal_type.includes('_time_'));

        // Pick the primary metric to show at the top
        let primaryLabel = '';
        let primaryProgress = 0;

        if (sessionsGoal) {
            const actual = Number(sessionsGoal.actual_value) || 0;
            const target = Number(sessionsGoal.goal_value) || 1;
            primaryLabel = `${actual} / ${target} sessions this week`;
            primaryProgress = _pct(actual, target);
        } else if (distanceGoal) {
            const actual = displayDistance(Number(distanceGoal.actual_value) || 0);
            const target = displayDistance(Number(distanceGoal.goal_value) || 0);
            primaryLabel = `${actual} / ${target} km this week`;
            primaryProgress = _pct(Number(distanceGoal.actual_value), Number(distanceGoal.goal_value));
        } else if (weightGoal) {
            const actual = Number(weightGoal.actual_value) || 0;
            const target = Number(weightGoal.goal_value) || 1;
            primaryLabel = `${actual.toLocaleString()} / ${target.toLocaleString()} kg this week`;
            primaryProgress = _pct(actual, target);
        }

        html += `
        <div class="goal-card">
            <div class="goal-top" style="cursor:pointer;" onclick="toggleGoalExpand('${cardId}')">
                <span class="goal-icon">${icon}</span>
                <div style="flex:1;">
                    <h3>${name}</h3>
                    <p>${primaryLabel || 'Weekly goals'}</p>
                </div>
                <span class="expand-arrow" id="arrow-${cardId}">▼</span>
            </div>

            <div class="goal-progress" style="margin-top:14px;">
                <div class="goal-fill" style="width:${primaryProgress}%;"></div>
            </div>

            <div class="goal-subgoals" id="${cardId}" style="display:none; margin-top:14px;">`;

        // Render each sub-goal inside the dropdown
        for (const g of goals) {
            const cfg = getGoalConfig(g.goal_type);
            const goalVal = Number(g.goal_value) || 0;
            const actualVal = Number(g.actual_value) || 0;

            let goalStr, actualStr, progress;

            if (cfg.isDistance) {
                goalStr = displayDistance(goalVal) + ' km';
                actualStr = displayDistance(actualVal) + ' km';
                progress = _pct(actualVal, goalVal);
            } else if (cfg.isTime) {
                goalStr = _secToTime(goalVal);
                actualStr = actualVal > 0 ? _secToTime(actualVal) : '—';
                progress = actualVal > 0 ? _pct(goalVal, actualVal) : 0;
            } else {
                goalStr = `${goalVal.toLocaleString()} ${cfg.unit}`.trim();
                actualStr = `${actualVal.toLocaleString()} ${cfg.unit}`.trim();
                progress = _pct(actualVal, goalVal);
            }

            const subName = g.goal_name || formatGoalName(g.goal_type);

            html += `
                <div style="padding:12px 0; border-top:1px solid rgba(0,0,0,0.06);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <span style="font-size:13px; font-weight:700; color:var(--dark);">${subName}</span>
                        <span style="font-size:12px; color:var(--muted);">${cfg.isTime ? 'Target time' : ''}</span>
                    </div>
                    <div class="goal-values" style="margin-bottom:8px;">
                        <div><span>Goal</span><strong>${goalStr}</strong></div>
                        <div><span>Actual</span><strong>${actualStr}</strong></div>
                    </div>
                    <div class="goal-progress" style="margin-bottom:8px;">
                        <div class="goal-fill" style="width:${progress}%;"></div>
                    </div>
                    ${cfg.isTime ? `
                    <div class="goal-form">
                        <input type="text" placeholder="e.g. 24:30" />
                        <button type="button" onclick="updateDashGoal(this, ${g.goal_id}, '${g.goal_type}')">Update</button>
                    </div>` : ''}
                </div>`;
        }

        html += `</div></div>`;
    }

    // Render standalone goals (calorie_intake, water, steps, etc.)
    for (const g of standalone) {
        const cfg = getGoalConfig(g.goal_type);
        const goalVal = Number(g.goal_value) || 0;
        const actualVal = Number(g.actual_value) || 0;

        let goalStr, actualStr, progress;

        if (cfg.isTime) {
            goalStr = _secToTime(goalVal);
            actualStr = _secToTime(actualVal);
            progress = actualVal > 0 ? _pct(goalVal, actualVal) : 0;
        } else {
            goalStr = `${goalVal.toLocaleString()} ${cfg.unit}`.trim();
            actualStr = `${actualVal.toLocaleString()} ${cfg.unit}`.trim();
            progress = _pct(actualVal, goalVal);
        }

        const name = g.goal_name || formatGoalName(g.goal_type);

        html += `
        <div class="goal-card">
            <div class="goal-top">
                <span class="goal-icon">${cfg.icon}</span>
                <div>
                    <h3>${name}</h3>
                    <p>${cfg.isTime ? 'Target time' : 'Target vs actual'}</p>
                </div>
            </div>
            <div class="goal-values">
                <div><span>Goal</span><strong>${goalStr}</strong></div>
                <div><span>Actual</span><strong>${actualStr}</strong></div>
            </div>
            <div class="goal-progress">
                <div class="goal-fill" style="width:${progress}%;"></div>
            </div>
            <div class="goal-form">
                <input type="text" placeholder="${cfg.isTime ? 'e.g. 24:30' : 'Update value'}" />
                <button type="button" onclick="updateDashGoal(this, ${g.goal_id}, '${g.goal_type}')">Update</button>
            </div>
        </div>`;
    }

    grid.innerHTML = html;
}

// Toggle expand/collapse for grouped exercise goals
function toggleGoalExpand(cardId) {
    const el = document.getElementById(cardId);
    const arrow = document.getElementById('arrow-' + cardId);
    if (el.style.display === 'none') {
        el.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        el.style.display = 'none';
        arrow.textContent = '▼';
    }
}

// ─────────────────────────────────────────────
//  GOAL UPDATE
// ─────────────────────────────────────────────
async function updateDashGoal(btn, goalId, goalType) {
    const input = btn.previousElementSibling;
    const raw = input.value.trim();
    if (!raw) return;

    const cfg = getGoalConfig(goalType);
    const newActual = cfg.isTime ? _timeToSec(raw) : parseFloat(raw);
    if (isNaN(newActual)) return alert('Invalid value');

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch(`/api/goals/${goalId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ actual_value: newActual, _csrf: csrfToken }),
        });

        if (res.ok) {
            input.value = '';
            loadDashboard();
        }
    } catch (e) {
        console.error('Goal update failed', e);
    }
}

// ─────────────────────────────────────────────
//  MAIN LOAD
// ─────────────────────────────────────────────
async function loadDashboard() {
    try {
        const res = await fetch('/api/dashboard-stats');
        if (res.ok) populateStats(await res.json());
    } catch (err) { console.error('Stats fetch error:', err); }

    // Use the auto-progress endpoint instead of plain /api/goals
    try {
        const res = await fetch('/api/goals-with-progress');
        if (res.ok) {
            const data = await res.json();
            populateGoals(data.goals || []);
        }
    } catch (err) { console.error('Goals fetch error:', err); }

    try {
        const res = await fetch('/api/food-log/today-by-meal');
        if (res.ok) {
            const data = await res.json();
            populateMealChart(data.meals || []);
        }
    } catch (err) { console.error('Meal chart fetch error:', err); }

    try {
        const res = await fetch('/api/weekly-exercise');
        if (res.ok) {
            const data = await res.json();
            populateWeeklyChart(data.days || []);
        }
    } catch (err) { console.error('Weekly exercise fetch error:', err); }
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
initCharts();
loadDashboard();

window.addEventListener('pageshow', event => {
    if (event.persisted) loadDashboard();
});