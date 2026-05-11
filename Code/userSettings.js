// ─────────────────────────────────────────────
//  GOAL CONFIG
// ─────────────────────────────────────────────
const GOAL_CONFIG = {
    weight_loss: { label: 'Weight Loss', unit: 'kg',    isTime: false, higherIsBetter: false, targetHint: 'e.g. 10',      currentHint: 'e.g. 4.5'   },
    calories:    { label: 'Calories',    unit: 'kcal',  isTime: false, higherIsBetter: false, targetHint: 'e.g. 2000',    currentHint: 'e.g. 1800'  },
    steps:       { label: 'Steps',       unit: 'steps', isTime: false, higherIsBetter: true,  targetHint: 'e.g. 10000',   currentHint: 'e.g. 7500'  },
    gym_weight:  { label: 'Gym',         unit: 'kg',    isTime: false, higherIsBetter: true,  targetHint: 'e.g. 8000',    currentHint: 'e.g. 6750'  },
    '5k_run':    { label: 'Running',     unit: '',      isTime: true,  higherIsBetter: false, targetHint: 'e.g. 25:00',   currentHint: 'e.g. 27:30' },
    '10k_run':   { label: 'Running',     unit: '',      isTime: true,  higherIsBetter: false, targetHint: 'e.g. 55:00',   currentHint: 'e.g. 59:00' },
    water:       { label: 'Water',       unit: 'ml',    isTime: false, higherIsBetter: true,  targetHint: 'e.g. 2000',    currentHint: 'e.g. 1500'  },
    custom:      { label: 'Custom',      unit: '',      isTime: false, higherIsBetter: true,  targetHint: 'Enter target', currentHint: 'Enter current' },
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function timeToSeconds(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
    }
    return parseFloat(str) || 0;
}

function secondsToTime(s) {
    const total = Math.round(parseFloat(s));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatValue(val, config) {
    if (val === null || val === undefined || val === '') return '—';
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    if (config.isTime) return secondsToTime(n);
    return config.unit ? `${n} ${config.unit}` : `${n}`;
}

function calcProgress(actual, goal, config) {
    const a = parseFloat(actual), g = parseFloat(goal);
    if (!a || !g || isNaN(a) || isNaN(g)) return 0;
    if (config.higherIsBetter) return Math.min(100, Math.round((a / g) * 100));
    return Math.min(100, Math.round((g / a) * 100));
}

function showMsg(id, text, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'feedback-msg ' + (isError ? 'error' : 'success');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function formatDeadline(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────
//  GOAL TYPE CHANGE
// ─────────────────────────────────────────────
function onGoalTypeChange() {
    const type = document.getElementById('goal-type').value;
    const config = GOAL_CONFIG[type];
    if (!config) return;
    document.getElementById('goal-target').placeholder  = config.targetHint;
    document.getElementById('goal-current').placeholder = config.currentHint;
    document.getElementById('goal-target-label').textContent =
        config.isTime ? 'Target Time (MM:SS)' : `Target (${config.unit || 'value'})`;
    document.getElementById('goal-current-label').textContent =
        config.isTime ? 'Current Best (MM:SS)' : `Current Progress (${config.unit || 'value'})`;
}

// ─────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────
async function loadProfile() {
    try {
        const res = await fetch('/api/user-profile');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('banner-username').textContent          = data.username    || 'User';
        document.getElementById('real_name').value                      = data.real_name   || '';
        document.getElementById('username').value                       = data.username    || '';
        document.getElementById('email').value                          = data.email       || '';
        document.getElementById('age').value                            = data.age         || '';
        document.getElementById('height_cm').value                      = data.height_cm   || '';
        document.getElementById('weight_kg').value                      = data.weight_kg   || '';
        document.getElementById('calorie_goal').value                   = data.calorie_goal          || '';
        document.getElementById('weekly_exercise_goal').value           = data.weekly_exercise_goal  || '';

        if (data.sex) {
            const el = document.querySelector(`input[name="sex"][value="${data.sex}"]`);
            if (el) el.checked = true;
        }
        if (data.units) {
            const el = document.querySelector(`input[name="units"][value="${data.units}"]`);
            if (el) el.checked = true;
        }
    } catch (err) {
        console.error('Load profile error:', err);
    }
}

async function saveProfile() {
    const body = {
        real_name: document.getElementById('real_name').value.trim()  || null,
        email:     document.getElementById('email').value.trim()       || null,
        age:       document.getElementById('age').value                || null,
        height_cm: document.getElementById('height_cm').value          || null,
        weight_kg: document.getElementById('weight_kg').value          || null,
        sex:       document.querySelector('input[name="sex"]:checked')?.value || null,
    };
    try {
        const res = await fetch('/api/user-profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        showMsg('profile-msg', res.ok ? '✓ Personal details saved!' : 'Failed to save.', !res.ok);
        if (res.ok) loadProfile();
    } catch {
        showMsg('profile-msg', 'Network error. Please try again.', true);
    }
}

async function savePreferences() {
    const body = {
        calorie_goal:         document.getElementById('calorie_goal').value         || null,
        weekly_exercise_goal: document.getElementById('weekly_exercise_goal').value || null,
        units:                document.querySelector('input[name="units"]:checked')?.value || null,
    };
    try {
        const res = await fetch('/api/user-profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        showMsg('prefs-msg', res.ok ? '✓ Preferences saved!' : 'Failed to save.', !res.ok);
    } catch {
        showMsg('prefs-msg', 'Network error. Please try again.', true);
    }
}

// ─────────────────────────────────────────────
//  GOALS
// ─────────────────────────────────────────────
async function loadGoals() {
    try {
        const res = await fetch('/api/goals');
        if (!res.ok) return;
        const data = await res.json();
        renderGoals(data.goals || []);
    } catch (err) {
        console.error('Load goals error:', err);
    }
}

function renderGoals(goals) {
    const list = document.getElementById('goal-list');
    if (!goals.length) {
        list.innerHTML = '<div class="empty-state">No active goals yet. Add one above!</div>';
        return;
    }

    list.innerHTML = goals.map(g => {
        const cfg       = GOAL_CONFIG[g.goal_type] || { label: 'Goal', unit: '', isTime: false, higherIsBetter: true };
        const progress  = calcProgress(g.actual_value, g.goal_value, cfg);
        const goalStr   = formatValue(g.goal_value,   cfg);
        const actualStr = formatValue(g.actual_value, cfg);
        const deadline  = formatDeadline(g.deadline);
        const name      = g.goal_name || cfg.label;
        const hint      = cfg.isTime ? 'MM:SS' : (cfg.unit || 'value');

        return `
      <div class="goal-entry" data-id="${g.goal_id}" data-type="${g.goal_type}">
        <div class="goal-entry-left">
          <span class="goal-tag">${cfg.label}</span>
          <span class="goal-name">${name}</span>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width:${progress}%;"></div>
          </div>
          <span class="goal-meta">${actualStr} of ${goalStr} target · ${progress}%</span>
          <div class="goal-update-row">
            <input
              type="text"
              class="progress-input"
              placeholder="Update progress (${hint})"
              data-goal-id="${g.goal_id}"
              data-goal-type="${g.goal_type}"
            />
            <button type="button" class="update-btn" data-goal-id="${g.goal_id}" data-goal-type="${g.goal_type}">
              Update
            </button>
          </div>
        </div>
        <div class="goal-entry-right">
          ${deadline ? `<span class="goal-date">${deadline}</span>` : ''}
          <button type="button" class="delete-btn" data-goal-id="${g.goal_id}">×</button>
        </div>
      </div>`;
    }).join('');
}

async function addGoal() {
    const goalType   = document.getElementById('goal-type').value;
    const goalName   = document.getElementById('goal-name').value.trim();
    const targetRaw  = document.getElementById('goal-target').value.trim();
    const currentRaw = document.getElementById('goal-current').value.trim();
    const deadline   = document.getElementById('goal-deadline').value;

    if (!goalType)  return showMsg('goal-add-msg', 'Please select a goal type.', true);
    if (!goalName)  return showMsg('goal-add-msg', 'Please enter a goal name.', true);
    if (!targetRaw) return showMsg('goal-add-msg', 'Please enter a target value.', true);

    const cfg = GOAL_CONFIG[goalType] || { isTime: false };
    const goalValue   = cfg.isTime ? timeToSeconds(targetRaw)  : parseFloat(targetRaw);
    const actualValue = currentRaw ? (cfg.isTime ? timeToSeconds(currentRaw) : parseFloat(currentRaw)) : null;

    if (isNaN(goalValue) || goalValue <= 0) return showMsg('goal-add-msg', 'Invalid target value.', true);

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ goal_type: goalType, goal_name: goalName, goal_value: goalValue, actual_value: actualValue, deadline: deadline || null }),
        });

        if (res.ok) {
            showMsg('goal-add-msg', '✓ Goal added successfully!');
            document.getElementById('goal-type').value    = '';
            document.getElementById('goal-name').value    = '';
            document.getElementById('goal-target').value  = '';
            document.getElementById('goal-current').value = '';
            document.getElementById('goal-deadline').value= '';
            onGoalTypeChange();
            loadGoals();
        } else {
            const err = await res.json();
            showMsg('goal-add-msg', err.error || 'Failed to add goal.', true);
        }
    } catch {
        showMsg('goal-add-msg', 'Network error. Please try again.', true);
    }
}

async function updateGoalProgress(goalId, goalType) {
    const row   = document.querySelector(`[data-id="${goalId}"]`);
    const input = row?.querySelector('.progress-input');
    if (!input || !input.value.trim()) return;

    const cfg       = GOAL_CONFIG[goalType] || { isTime: false };
    const newActual = cfg.isTime ? timeToSeconds(input.value.trim()) : parseFloat(input.value.trim());

    if (isNaN(newActual)) {
        input.style.borderColor = '#d11a2a';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
        return;
    }

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch(`/api/goals/${goalId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ actual_value: newActual }),
        });
        if (res.ok) { input.value = ''; loadGoals(); }
    } catch (err) {
        console.error('Update goal error:', err);
    }
}

async function deleteGoal(goalId) {
    if (!confirm('Delete this goal? This cannot be undone.')) return;
    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch(`/api/goals/${goalId}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrfToken },
        });
        if (res.ok) loadGoals();
    } catch (err) {
        console.error('Delete goal error:', err);
    }
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS  (replaces all inline onclick/onchange)
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('goal-type').addEventListener('change', onGoalTypeChange);
    document.getElementById('add-goal-btn').addEventListener('click', addGoal);
    document.getElementById('save-profile-btn').addEventListener('click', saveProfile);
    document.getElementById('save-prefs-btn').addEventListener('click', savePreferences);

    // Delegated events for dynamically rendered goal entries
    document.getElementById('goal-list').addEventListener('click', e => {
        const updateBtn = e.target.closest('.update-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (updateBtn) {
            updateGoalProgress(updateBtn.dataset.goalId, updateBtn.dataset.goalType);
        }
        if (deleteBtn) {
            deleteGoal(deleteBtn.dataset.goalId);
        }
    });

    document.getElementById('goal-list').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.classList.contains('progress-input')) {
            updateGoalProgress(e.target.dataset.goalId, e.target.dataset.goalType);
        }
    });

    loadProfile();
    loadGoals();
});
