async function getCsrfToken() {
    const res = await fetch('/api/csrf-token');
    const data = await res.json();
    return data.csrfToken;
}
function val(id) { return document.getElementById(id).value.trim(); }

// ═══════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════
let userStats = { height_cm: 0, weight_kg: 0, age: 0, gender: '' };
let selectedActivityFactor = null;
let selectedGoalType = null;
let selectedGoalValue = null;

// Phase 2 state
let selectedExercises = new Set();
// Each config now stores separate values per goal type so switching tabs doesn't erase them
// { running: { goalType: 'sessions', sessions: 3, distance: 30, weight_moved: null, timeGoals: [...] }, ... }
let exerciseGoalConfigs = {};

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function calculateAge(dob) {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function calculateBMR(weight, height, age, gender) {
    if (gender === 'female') return (10 * weight) + (6.25 * height) - (5 * age) - 161;
    return (10 * weight) + (6.25 * height) - (5 * age) + 5;
}

function calculateCalorieGoals(bmr, activityFactor) {
    const tdee = Math.round(bmr * activityFactor);
    return {
        cut_extreme: Math.max(1200, tdee - 1000),
        cut_moderate: Math.max(1200, tdee - 500),
        maintain: tdee,
        bulk_moderate: tdee + 250,
        bulk_extreme: tdee + 500
    };
}

const EXERCISE_LABELS = {
    swimming: 'Swimming', running: 'Running', cycling: 'Cycling',
    walking: 'Walking', gym: 'Gym'
};

const DISTANCE_EXERCISES = ['swimming', 'running', 'cycling', 'walking'];

// ═══════════════════════════════════════════════════════════════
//  Registration
// ═══════════════════════════════════════════════════════════════
async function handleRegister() {
    const btn = document.getElementById('registerBtn');
    const errorBox = document.getElementById('errorBox');
    errorBox.style.display = 'none';

    const payload = {
        username: val('username'), real_name: val('real_name'), email: val('email'),
        password: document.getElementById('password').value,
        confirm_password: document.getElementById('confirm_password').value,
        height_cm: val('height_cm') || null, weight_kg: val('weight_kg') || null,
        DoB: val('DoB') || null, gender: val('gender') || null
    };

    userStats.height_cm = Number(payload.height_cm) || 0;
    userStats.weight_kg = Number(payload.weight_kg) || 0;
    userStats.gender = payload.gender || 'male';
    userStats.age = payload.DoB ? calculateAge(payload.DoB) : 25;

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
        const csrfToken = await getCsrfToken();
        payload._csrf = csrfToken;
        const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.success) {
            if (userStats.height_cm > 0 && userStats.weight_kg > 0) {
                document.getElementById('goalOverlay').style.display = 'block';
            } else {
                goToPhase2();
            }
        } else {
            errorBox.textContent = data.errors.join(' ');
            errorBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    } catch {
        errorBox.textContent = 'Network error. Please try again.';
        errorBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

// ═══════════════════════════════════════════════════════════════
//  Phase 1: Activity + Calorie
// ═══════════════════════════════════════════════════════════════
function selectActivity(el, factor) {
    document.querySelectorAll('.activity-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input[type="radio"]').checked = true;
    selectedActivityFactor = factor;

    const bmr = calculateBMR(userStats.weight_kg, userStats.height_cm, userStats.age, userStats.gender);
    const goals = calculateCalorieGoals(bmr, factor);

    document.getElementById('bmrInfo').style.display = 'block';
    document.getElementById('maintenanceCals').textContent = goals.maintain;
    document.getElementById('cutExtremeCals').textContent = goals.cut_extreme;
    document.getElementById('cutModerateCals').textContent = goals.cut_moderate;
    document.getElementById('maintainCals').textContent = goals.maintain;
    document.getElementById('bulkModerateCals').textContent = goals.bulk_moderate;
    document.getElementById('bulkExtremeCals').textContent = goals.bulk_extreme;

    document.getElementById('calorieTitle').style.display = 'block';
    document.getElementById('calorieGoals').classList.add('visible');
    document.querySelectorAll('.calorie-card').forEach(c => c.classList.remove('selected'));
    selectedGoalType = null; selectedGoalValue = null;
    document.getElementById('saveGoalBtn').disabled = true;
}

function selectCalorieGoal(el, goalType) {
    document.querySelectorAll('.calorie-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedGoalType = goalType;
    selectedGoalValue = Number(el.querySelector('.calorie-card-value').textContent);
    document.getElementById('saveGoalBtn').disabled = false;
}

async function saveCalorieGoal() {
    if (!selectedGoalType || !selectedGoalValue) return;
    const btn = document.getElementById('saveGoalBtn');
    const errorEl = document.getElementById('goalError');
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Saving...';

    try {
        const csrfToken = await getCsrfToken();
        const res = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ goal_type: 'calorie_intake', target_val: selectedGoalValue, _csrf: csrfToken })
        });
        const data = await res.json();
        if (data.success) {
            goToPhase2();
        } else {
            errorEl.textContent = data.error || 'Failed to save goal.';
            errorEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Save Calorie Goal';
        }
    } catch {
        errorEl.textContent = 'Network error.';
        errorEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Save Calorie Goal';
    }
}

function goToPhase2() {
    document.getElementById('goalOverlay').style.display = 'none';
    document.getElementById('exerciseGoalOverlay').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
//  Phase 2: Exercise Goals
// ═══════════════════════════════════════════════════════════════

function toggleExercise(el, type) {
    el.classList.toggle('selected');

    if (selectedExercises.has(type)) {
        selectedExercises.delete(type);
        delete exerciseGoalConfigs[type];
    } else {
        selectedExercises.add(type);
        // Store separate values for each goal type so switching tabs doesn't erase input
        exerciseGoalConfigs[type] = {
            goalType: 'sessions',
            sessions: null,
            distance: null,
            weight_moved: null,
            timeGoals: []
        };
    }

    renderExerciseConfigs();
    document.getElementById('saveExerciseGoalsBtn').disabled = selectedExercises.size === 0;
}

function renderExerciseConfigs() {
    const container = document.getElementById('exerciseGoalConfigs');

    if (selectedExercises.size === 0) {
        container.innerHTML = '<p class="no-exercises-selected" id="noExercisesMsg">Select an exercise above to set a goal.</p>';
        return;
    }

    let html = '';
    for (const type of selectedExercises) {
        const label = EXERCISE_LABELS[type];
        const isGym = type === 'gym';
        const isDistance = DISTANCE_EXERCISES.includes(type);
        const config = exerciseGoalConfigs[type];

        html += `<div class="exercise-goal-config" id="config-${type}">
            <h4>${label} Goal</h4>
            <div class="goal-type-tabs">
                <button type="button" class="goal-type-tab ${config.goalType === 'sessions' ? 'active' : ''}"
                    onclick="setExGoalType('${type}','sessions')">Sessions/Week</button>`;

        if (isDistance) {
            html += `<button type="button" class="goal-type-tab ${config.goalType === 'distance' ? 'active' : ''}"
                    onclick="setExGoalType('${type}','distance')">Distance/Week</button>
                <button type="button" class="goal-type-tab ${config.goalType === 'time' ? 'active' : ''}"
                    onclick="setExGoalType('${type}','time')">Target Time</button>`;
        }

        if (isGym) {
            html += `<button type="button" class="goal-type-tab ${config.goalType === 'weight_moved' ? 'active' : ''}"
                    onclick="setExGoalType('${type}','weight_moved')">Weight Moved/Week</button>`;
        }

        html += `</div>`;

        // Render the input for the currently selected goal type
        // Each type reads/writes its own field so values persist
        if (config.goalType === 'sessions') {
            html += `<div class="goal-input-row">
                <label>Sessions</label>
                <input type="number" min="1" max="14" placeholder="e.g. 3" value="${config.sessions || ''}"
                    onchange="exerciseGoalConfigs['${type}'].sessions = Number(this.value)">
                <span style="font-size:13px;color:var(--muted)">per week</span>
            </div>`;
        } else if (config.goalType === 'distance') {
            html += `<div class="goal-input-row">
                <label>Distance</label>
                <input type="number" min="0.1" step="0.1" placeholder="e.g. 15" value="${config.distance || ''}"
                    onchange="exerciseGoalConfigs['${type}'].distance = Number(this.value)">
                <span style="font-size:13px;color:var(--muted)">km per week</span>
            </div>`;
        } else if (config.goalType === 'weight_moved') {
            html += `<div class="goal-input-row">
                <label>Weight</label>
                <input type="number" min="1" step="1" placeholder="e.g. 5000" value="${config.weight_moved || ''}"
                    onchange="exerciseGoalConfigs['${type}'].weight_moved = Number(this.value)">
                <span style="font-size:13px;color:var(--muted)">kg per week</span>
            </div>`;
        } else if (config.goalType === 'time') {
            const timeGoals = config.timeGoals || [];
            html += `<div class="time-goal-group">`;

            for (let i = 0; i < timeGoals.length; i++) {
                html += `<div class="time-goal-entry">
                    <label>Distance</label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <button type="button" onclick="adjustDistance('${type}',${i},-0.5)" style="width:28px;height:28px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">−</button>
                        <input type="number" min="0.1" step="0.5" value="${timeGoals[i].distance || 1}" style="width:65px;text-align:center;"
                            onchange="updateTimeDistance('${type}',${i},this.value)">
                        <button type="button" onclick="adjustDistance('${type}',${i},0.5)" style="width:28px;height:28px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">+</button>
                        <span style="font-size:13px;color:var(--muted)">km</span>
                    </div>
                    <label style="margin-left:10px;">Target</label>
                    <input type="text" placeholder="HH:MM.SS" value="${timeGoals[i].time || ''}" style="width:100px;"
                        onchange="updateTimeTarget('${type}',${i},this.value)">
                    <button type="button" class="remove-distance-btn" onclick="removeTimeGoal('${type}',${i})">✕</button>
                </div>`;
            }

            if (timeGoals.length < 3) {
                html += `<button type="button" class="add-distance-btn" onclick="addTimeGoal('${type}')">+ Add distance (${timeGoals.length}/3)</button>`;
            }

            html += `</div>`;
        }

        html += `</div>`;
    }

    container.innerHTML = html;
}

function setExGoalType(type, goalType) {
    // Just switch the active tab — don't reset any values
    exerciseGoalConfigs[type].goalType = goalType;
    if (goalType === 'time' && exerciseGoalConfigs[type].timeGoals.length === 0) {
        exerciseGoalConfigs[type].timeGoals = [{ distance: 5, time: '' }];
    }
    renderExerciseConfigs();
}

function addTimeGoal(type) {
    if (exerciseGoalConfigs[type].timeGoals.length >= 3) return;
    exerciseGoalConfigs[type].timeGoals.push({ distance: 5, time: '' });
    renderExerciseConfigs();
}

function removeTimeGoal(type, index) {
    exerciseGoalConfigs[type].timeGoals.splice(index, 1);
    renderExerciseConfigs();
}

function updateTimeDistance(type, index, value) {
    exerciseGoalConfigs[type].timeGoals[index].distance = Number(value);
}

function updateTimeTarget(type, index, value) {
    exerciseGoalConfigs[type].timeGoals[index].time = value;
}

function adjustDistance(type, index, delta) {
    const tg = exerciseGoalConfigs[type].timeGoals[index];
    tg.distance = Math.max(0.5, (tg.distance || 1) + delta);
    renderExerciseConfigs();
}

// ═══════════════════════════════════════════════════════════════
//  Save ALL exercise goals (every filled-in field, not just active tab)
// ═══════════════════════════════════════════════════════════════

async function saveExerciseGoals() {
    const btn = document.getElementById('saveExerciseGoalsBtn');
    const errorEl = document.getElementById('exerciseGoalError');
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Saving...';

    const goals = [];

    for (const type of selectedExercises) {
        const config = exerciseGoalConfigs[type];

        // Save sessions if filled
        if (config.sessions) {
            goals.push({ goal_type: `${type}_sessions_week`, target_val: Math.round(config.sessions) });
        }

        // Save distance if filled (for distance exercises)
        if (config.distance && DISTANCE_EXERCISES.includes(type)) {
            goals.push({ goal_type: `${type}_distance_week`, target_val: Math.round(config.distance * 10) });
        }

        // Save weight moved if filled (gym only)
        if (config.weight_moved && type === 'gym') {
            goals.push({ goal_type: 'gym_weight_moved_week', target_val: Math.round(config.weight_moved) });
        }

        // Save all time goals if filled
        if (config.timeGoals && config.timeGoals.length > 0) {
            for (const tg of config.timeGoals) {
                if (tg.distance && tg.time) {
                    const seconds = parseTimeToSeconds(tg.time);
                    if (seconds > 0) {
                        goals.push({ goal_type: `${type}_time_${tg.distance}km`, target_val: seconds });
                    }
                }
            }
        }
    }

    if (goals.length === 0) {
        errorEl.textContent = 'Please fill in at least one goal value.';
        errorEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Save Exercise Goals';
        return;
    }

    try {
        const csrfToken = await getCsrfToken();
        const res = await fetch('/api/goals/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ goals, _csrf: csrfToken })
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = '/dashboard';
        } else {
            errorEl.textContent = data.error || 'Failed to save goals.';
            errorEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Save Exercise Goals';
        }
    } catch {
        errorEl.textContent = 'Network error.';
        errorEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Save Exercise Goals';
    }
}

function parseTimeToSeconds(str) {
    const parts = str.replace(':', '.').split('.');
    if (parts.length === 3) {
        return (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0);
    } else if (parts.length === 2) {
        return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    } else {
        return (parseInt(parts[0]) || 0) * 60;
    }
}

function skipToFinish() {
    window.location.href = '/dashboard';
}