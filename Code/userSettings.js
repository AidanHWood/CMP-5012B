// ─────────────────────────────────────────────
//  GOAL CONFIG
// ─────────────────────────────────────────────
const GOAL_CONFIG = {
    water:       { label: 'Water',       unit: 'ml',    isTime: false, higherIsBetter: true,  targetHint: 'e.g. 2000 ml',  currentHint: 'e.g. 1500 ml'  },
    steps:       { label: 'Steps',       unit: 'steps', isTime: false, higherIsBetter: true,  targetHint: 'e.g. 10000',    currentHint: 'e.g. 7500'     },
    weight_loss: { label: 'Weight Loss', unit: 'kg',    isTime: false, higherIsBetter: false, targetHint: 'e.g. 10 kg',    currentHint: 'e.g. 4.5 kg'  },
    custom:      { label: 'Custom',      unit: '',      isTime: false, higherIsBetter: true,  targetHint: 'Enter target',  currentHint: 'Enter current' },
    calorie_intake:        { label: 'Calorie Intake', unit: 'kcal', isTime: false, higherIsBetter: false },
    gym_weight_moved_week: { label: 'Gym',           unit: 'kg',   isTime: false, higherIsBetter: true },
};

function getGoalCfg(goalType) {
    if (GOAL_CONFIG[goalType]) return GOAL_CONFIG[goalType];
    if (goalType.includes('_sessions_week')) {
        return { label: capitalize(goalType.replace('_sessions_week', '')), unit: 'sessions', isTime: false, higherIsBetter: true };
    }
    if (goalType.includes('_distance_week')) {
        return { label: capitalize(goalType.replace('_distance_week', '')), unit: 'km', isTime: false, higherIsBetter: true, isDistance: true };
    }
    if (goalType.includes('_time_')) {
        const parts = goalType.split('_time_');
        return { label: `${capitalize(parts[0])} ${parts[1] || ''}`, unit: '', isTime: true, higherIsBetter: false };
    }
    return { label: 'Goal', unit: '', isTime: false, higherIsBetter: true };
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function timeToSeconds(str) {
    if (!str) return 0;
    const parts = str.replace('.', ':').split(':').map(Number);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    return parseFloat(str) || 0;
}

function secondsToTime(s) {
    const total = Math.round(parseFloat(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatValue(val, config) {
    if (val === null || val === undefined || val === '') return '—';
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    if (config.isTime) return secondsToTime(n);
    if (config.isDistance) return `${(n / 10).toFixed(1)} ${config.unit}`;
    return config.unit ? `${n.toLocaleString()} ${config.unit}` : `${n.toLocaleString()}`;
}

function calcProgress(actual, goal, config) {
    const a = parseFloat(actual), g = parseFloat(goal);
    if (!a || !g || isNaN(a) || isNaN(g)) return 0;
    if (config.isTime) return Math.min(100, Math.round((g / a) * 100));
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

function goalIcon(goalType) {
    if (goalType.includes('running'))  return '🏃';
    if (goalType.includes('swimming')) return '🏊';
    if (goalType.includes('cycling'))  return '🚴';
    if (goalType.includes('walking'))  return '🚶';
    if (goalType.includes('gym'))      return '🏋️';
    if (goalType.includes('calorie'))  return '🔥';
    if (goalType === 'water')          return '💧';
    if (goalType === 'steps')          return '👟';
    if (goalType === 'weight_loss')    return '⚖️';
    return '🎯';
}

// ─────────────────────────────────────────────
//  GOAL TYPE SELECTOR (card style)
// ─────────────────────────────────────────────
let selectedAddType = null;

function selectGoalType(el, type) {
    document.querySelectorAll('.goal-type-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedAddType = type;

    const cfg = GOAL_CONFIG[type];
    const form = document.getElementById('goalDetailsForm');
    form.style.display = 'block';

    document.getElementById('goal-name').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-current').value = '';
    document.getElementById('goal-deadline').value = '';

    document.getElementById('goal-target').placeholder = cfg?.targetHint || 'Enter target';
    document.getElementById('goal-current').placeholder = cfg?.currentHint || 'Enter current';
    document.getElementById('goal-target-label').textContent = cfg?.isTime ? 'Target Time (MM:SS)' : `Target (${cfg?.unit || 'value'})`;
    document.getElementById('goal-current-label').textContent = cfg?.isTime ? 'Current Best (MM:SS)' : `Current Progress (${cfg?.unit || 'value'})`;
}

// ─────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────
async function loadProfile() {
    try {
        const res = await fetch('/api/user-profile');
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('banner-username').textContent = data.username || 'User';
        document.getElementById('real_name').value    = data.real_name   || '';
        document.getElementById('username').value     = data.username    || '';
        document.getElementById('email').value        = data.email       || '';
        document.getElementById('age').value          = data.age         || '';
        document.getElementById('height_cm').value    = data.height_cm   || '';
        document.getElementById('weight_kg').value    = data.weight_kg   || '';
        document.getElementById('calorie_goal').value = data.calorie_goal || '';
        document.getElementById('weekly_exercise_goal').value = data.weekly_exercise_goal || '';
        if (data.sex) { const el = document.querySelector(`input[name="sex"][value="${data.sex}"]`); if (el) el.checked = true; }
        if (data.units) { const el = document.querySelector(`input[name="units"][value="${data.units}"]`); if (el) el.checked = true; }
    } catch (err) { console.error('Load profile error:', err); }
}

async function saveProfile() {
    const body = {
        real_name: document.getElementById('real_name').value.trim() || null,
        email: document.getElementById('email').value.trim() || null,
        age: document.getElementById('age').value || null,
        height_cm: document.getElementById('height_cm').value || null,
        weight_kg: document.getElementById('weight_kg').value || null,
        sex: document.querySelector('input[name="sex"]:checked')?.value || null,
    };
    try {
        const res = await fetch('/api/user-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showMsg('profile-msg', res.ok ? '✓ Personal details saved!' : 'Failed to save.', !res.ok);
        if (res.ok) loadProfile();
    } catch { showMsg('profile-msg', 'Network error.', true); }
}

async function savePreferences() {
    const body = {
        calorie_goal: document.getElementById('calorie_goal').value || null,
        weekly_exercise_goal: document.getElementById('weekly_exercise_goal').value || null,
        units: document.querySelector('input[name="units"]:checked')?.value || null,
    };
    try {
        const res = await fetch('/api/user-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showMsg('prefs-msg', res.ok ? '✓ Preferences saved!' : 'Failed to save.', !res.ok);
    } catch { showMsg('prefs-msg', 'Network error.', true); }
}

// ─────────────────────────────────────────────
//  GOALS — load and render
// ─────────────────────────────────────────────
async function loadGoals() {
    try {
        let res = await fetch('/api/goals-with-progress');
        if (!res.ok) res = await fetch('/api/goals');
        if (!res.ok) return;
        const data = await res.json();
        renderGoals(data.goals || []);
    } catch (err) { console.error('Load goals error:', err); }
}

function renderGoals(goals) {
    const list = document.getElementById('goal-list');
    if (!goals.length) {
        list.innerHTML = '<div class="empty-state">No active goals yet. Add one below!</div>';
        return;
    }

    list.innerHTML = goals.map(g => {
        const cfg       = getGoalCfg(g.goal_type);
        const goalVal   = Number(g.goal_value) || 0;
        const actualVal = Number(g.actual_value) || 0;
        const progress  = calcProgress(actualVal, goalVal, cfg);
        const goalStr   = formatValue(goalVal, cfg);
        const actualStr = formatValue(actualVal, cfg);
        const deadline  = formatDeadline(g.deadline);
        const name      = g.goal_name || cfg.label;
        const icon      = goalIcon(g.goal_type);
        const hint      = cfg.isTime ? 'HH:MM:SS' : (cfg.unit || 'value');

        const isAutoTracked = g.goal_type.includes('_sessions_week') ||
                              g.goal_type.includes('_distance_week') ||
                              g.goal_type === 'gym_weight_moved_week' ||
                              g.goal_type === 'calorie_intake';

        return `
      <div class="goal-entry" data-id="${g.goal_id}" data-type="${g.goal_type}">
        <div class="goal-entry-left">
          <span class="goal-tag">${icon} ${cfg.label}</span>
          <span class="goal-name">${name}</span>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width:${progress}%;"></div>
          </div>
          <span class="goal-meta">${actualStr} of ${goalStr} target · ${progress}%</span>
          ${isAutoTracked
            ? '<span class="goal-auto-badge">✓ Auto-tracked from your logs</span>'
            : `<div class="goal-update-row">
                <input type="text" class="progress-input" placeholder="Update (${hint})" data-goal-id="${g.goal_id}" data-goal-type="${g.goal_type}" />
                <button type="button" class="update-btn" data-goal-id="${g.goal_id}" data-goal-type="${g.goal_type}">Update</button>
              </div>`
          }
        </div>
        <div class="goal-entry-right">
          ${deadline ? `<span class="goal-date">${deadline}</span>` : ''}
          <button type="button" class="delete-btn" data-goal-id="${g.goal_id}">×</button>
        </div>
      </div>`;
    }).join('');
}

// ─────────────────────────────────────────────
//  GOALS — add, update, delete
// ─────────────────────────────────────────────
async function addGoal() {
    if (!selectedAddType) return showMsg('goal-add-msg', 'Please select a goal type above.', true);

    const goalName   = document.getElementById('goal-name').value.trim();
    const targetRaw  = document.getElementById('goal-target').value.trim();
    const currentRaw = document.getElementById('goal-current').value.trim();
    const deadline   = document.getElementById('goal-deadline').value;

    if (!goalName)  return showMsg('goal-add-msg', 'Please enter a goal name.', true);
    if (!targetRaw) return showMsg('goal-add-msg', 'Please enter a target value.', true);

    const cfg = GOAL_CONFIG[selectedAddType] || { isTime: false };
    const goalValue   = cfg.isTime ? timeToSeconds(targetRaw) : parseFloat(targetRaw);
    const actualValue = currentRaw ? (cfg.isTime ? timeToSeconds(currentRaw) : parseFloat(currentRaw)) : 0;

    if (isNaN(goalValue) || goalValue <= 0) return showMsg('goal-add-msg', 'Invalid target value.', true);

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ goal_type: selectedAddType, goal_name: goalName, goal_value: goalValue, actual_value: actualValue, deadline: deadline || null, _csrf: csrfToken }),
        });

        if (res.ok) {
            showMsg('goal-add-msg', '✓ Goal added!');
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-target').value = '';
            document.getElementById('goal-current').value = '';
            document.getElementById('goal-deadline').value = '';
            document.getElementById('goalDetailsForm').style.display = 'none';
            document.querySelectorAll('.goal-type-card').forEach(c => c.classList.remove('selected'));
            selectedAddType = null;
            loadGoals();
        } else {
            const err = await res.json();
            showMsg('goal-add-msg', err.error || 'Failed to add goal.', true);
        }
    } catch { showMsg('goal-add-msg', 'Network error.', true); }
}

async function updateGoalProgress(goalId, goalType) {
    const row = document.querySelector(`[data-id="${goalId}"]`);
    const input = row?.querySelector('.progress-input');
    if (!input || !input.value.trim()) return;

    const cfg = getGoalCfg(goalType);
    const newActual = cfg.isTime ? timeToSeconds(input.value.trim()) : parseFloat(input.value.trim());
    if (isNaN(newActual)) { input.style.borderColor = '#d11a2a'; setTimeout(() => { input.style.borderColor = ''; }, 1500); return; }

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch(`/api/goals/${goalId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ actual_value: newActual }) });
        if (res.ok) { input.value = ''; loadGoals(); }
    } catch (err) { console.error('Update goal error:', err); }
}

async function deleteGoal(goalId) {
    if (!confirm('Delete this goal? This cannot be undone.')) return;
    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
        if (res.ok) loadGoals();
    } catch (err) { console.error('Delete goal error:', err); }
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-goal-btn')?.addEventListener('click', addGoal);
    document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
    document.getElementById('save-prefs-btn')?.addEventListener('click', savePreferences);

    const goalList = document.getElementById('goal-list');
    if (goalList) {
        goalList.addEventListener('click', e => {
            const updateBtn = e.target.closest('.update-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            if (updateBtn) updateGoalProgress(updateBtn.dataset.goalId, updateBtn.dataset.goalType);
            if (deleteBtn) deleteGoal(deleteBtn.dataset.goalId);
        });
        goalList.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.classList.contains('progress-input')) {
                updateGoalProgress(e.target.dataset.goalId, e.target.dataset.goalType);
            }
        });
    }

    document.querySelectorAll('.logoutBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try { await fetch('/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
            window.location.href = '/login';
        });
    });

    loadProfile();
    loadGoals();
});