function populateStats(stats) {
    const cards = document.querySelectorAll('.stat-card');
    if (!cards.length) return;

    const eaten   = Number(stats.calories_eaten)  || 0;
    const burned  = Number(stats.calories_burned) || 0;
    const net     = Number(stats.net_calories)    || 0;
    const goal    = Number(stats.calorie_goal)    || 2000;
    const streak  = Number(stats.streak)          || 0;

    cards[0].querySelector('strong').textContent   = eaten.toLocaleString();
    cards[0].querySelector('.stat-sub').textContent = `of ${goal.toLocaleString()} goal`;
    cards[1].querySelector('strong').textContent   = burned.toLocaleString();
    cards[2].querySelector('strong').textContent   = net.toLocaleString();
    cards[3].querySelector('strong').textContent   = streak + (streak === 1 ? ' day' : ' days');

    if (typeof caloriesPieChart !== 'undefined' && caloriesPieChart) {
        caloriesPieChart.data.datasets[0].data = [eaten, Math.max(0, goal - eaten)];
        caloriesPieChart.update();
    }
    if (typeof macrosPieChart !== 'undefined' && macrosPieChart) {
        const p = Number(stats.macros?.protein) || 0;
        const c = Number(stats.macros?.carbs)   || 0;
        const f = Number(stats.macros?.fibre)   || 0;
        macrosPieChart.data.datasets[0].data = [p, c, f];
        macrosPieChart.update();
    }
}

// meal Line Chart 
function populateMealChart(meals) {
    if (!Array.isArray(meals) || !meals.length) return;
    if (typeof caloriesLineChart === 'undefined' || !caloriesLineChart) return;

    let cumulative = 0;
    const labels = [], data = [];
    meals.forEach(m => {
        const label = m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1);
        cumulative += parseFloat(m.meal_calories) || 0;
        labels.push(label);
        data.push(Math.round(cumulative));
    });
    caloriesLineChart.data.labels              = labels;
    caloriesLineChart.data.datasets[0].data   = data;
    caloriesLineChart.update();
}

// weekly Bar Chart 
function populateWeeklyChart(days) {
    if (!Array.isArray(days) || !days.length) return;
    if (typeof weeklyBarChart === 'undefined' || !weeklyBarChart) return;

    weeklyBarChart.data.labels              = days.map(d => d.label);
    weeklyBarChart.data.datasets[0].data   = days.map(d => d.calories_burned);
    weeklyBarChart.update();
}

function _pct(actual, goal) {
    if (!goal) return 0;
    return Math.min(100, Math.round((actual / goal) * 100));
}

function _secToTime(s) {
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function _timeToSec(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
}

function populateGoals(goalsArr) {
    const grid = document.getElementById('goals-grid');
    if (!grid) return;

    if (!goalsArr.length) {
        grid.innerHTML = '<div class="empty-state">No goals yet — add some in User Settings.</div>';
        return;
    }

    grid.innerHTML = goalsArr.map(g => {
        const cfg = GOAL_DEFAULTS[g.goal_type] || { goal: 100, actual: 0, unit: '', isTime: false };
        const goalVal   = Number(g.goal_value)   || cfg.goal;
        const actualVal = Number(g.actual_value) || 0;
        const goalId    = g.goal_id;

        const goalStr   = cfg.isTime ? _secToTime(goalVal)   : `${goalVal} ${cfg.unit}`.trim();
        const actualStr = cfg.isTime ? _secToTime(actualVal) : `${actualVal} ${cfg.unit}`.trim();
        const progress  = cfg.isTime && actualVal > 0
            ? _pct(goalVal, actualVal)
            : _pct(actualVal, goalVal);

        const name = g.goal_name || g.goal_type.replace(/_/g, ' ');

        return `
        <div class="goal-card">
          <div class="goal-top">
            <span class="goal-icon">${goalIcon(g.goal_type)}</span>
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
          <form class="goal-form">
            <input type="text" placeholder="${cfg.isTime ? 'e.g. 24:30' : 'Update value'}" />
            <button type="button" onclick="updateDashGoal(this, ${goalId}, '${g.goal_type}')">Update</button>
          </form>
        </div>`;
    }).join('');
}

function goalIcon(type) {
    const icons = {
        gym_weight: '🏋️', '5k_run': '🏃', '10k_run': '🌿',
        weight_loss: '⚖️', steps: '👟', calories: '🔥',
        water: '💧', custom: '🎯'
    };
    return icons[type] || '🎯';
}

async function updateDashGoal(btn, goalId, goalType) {
    const input = btn.previousElementSibling;
    const raw = input.value.trim();
    if (!raw) return;
    const cfg = GOAL_DEFAULTS[goalType] || { isTime: false };
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
        if (res.ok) { input.value = ''; loadDashboard(); }
    } catch (e) { console.error('Goal update failed', e); }
}

async function loadDashboard() {
    // stats + calories eaten
    try {
        const res = await fetch('/api/dashboard-stats');
        if (res.ok) {
            populateStats(await res.json());
        } else {
            console.warn('dashboard-stats returned', res.status);
        }
    } catch (err) {
        console.error('Stats fetch error:', err);
    }

    // goals
    try {
        const res = await fetch('/api/goals');
        if (res.ok) {
            const data = await res.json();
            populateGoals(data.goals || []);
        }
    } catch (err) {
        console.error('Goals fetch error:', err);
    }

    // meal line chart
    try {
        const res = await fetch('/api/food-log/today-by-meal');
        if (res.ok) {
            const data = await res.json();
            populateMealChart(data.meals || []);
        }
    } catch (err) {
        console.error('Meal chart fetch error:', err);
    }

    // eeekly exercise bar chart
    try {
        const res = await fetch('/api/weekly-exercise');
        if (res.ok) {
            const data = await res.json();
            populateWeeklyChart(data.days || []);
        }
    } catch (err) {
        console.error('Weekly exercise fetch error:', err);
    }
}

loadDashboard();

window.addEventListener('pageshow', (event) => {
    if (event.persisted) loadDashboard();
});
