const MET_VALUES = {
    running:  { low: 6.0, medium: 8.0, high: 11.5 },
    cycling:  { low: 4.0, medium: 6.8, high: 10.0 },
    walking:  { low: 2.5, medium: 3.5, high: 5.0 },
    swimming: { low: 4.5, medium: 7.0, high: 10.0 },
    gym:      { low: 3.5, medium: 5.0, high: 8.0 },
    sport:    { low: 4.0, medium: 6.0, high: 8.0 }
};

const DISTANCE_TYPES = ['running', 'cycling', 'walking', 'swimming'];
let userWeight = 70;

async function loadUserWeight() {
    try {
        const res = await fetch('/api/user-weight');
        if (res.ok) {
            const data = await res.json();
            userWeight = data.weight_kg || 70;
        }
    } catch (err) {
        console.log('Could not fetch user weight, using default 70kg');
    }
}

function calculateBurn(exerciseType, intensity, durationMin) {
    const met = MET_VALUES[exerciseType]?.[intensity] || 5.0;
    const hours = durationMin / 60;
    return Math.round(met * userWeight * hours);
}

function onFormChange() {
    const exerciseEl = document.querySelector('input[name="exercise"]:checked');
    const intensityEl = document.querySelector('input[name="intensity"]:checked');
    const duration = Number(document.getElementById('duration').value) || 0;

    // Show/hide distance field (running, cycling, walking, swimming)
    const distanceSection = document.getElementById('distanceSection');
    if (exerciseEl && DISTANCE_TYPES.includes(exerciseEl.value)) {
        distanceSection.style.display = 'block';
    } else {
        distanceSection.style.display = 'none';
    }

    // Show/hide weight moved field (gym only)
    const weightMovedSection = document.getElementById('weightMovedSection');
    if (exerciseEl && exerciseEl.value === 'gym') {
        weightMovedSection.style.display = 'block';
    } else {
        weightMovedSection.style.display = 'none';
    }

    // Calculate estimated burn
    let estimate = 0;
    if (exerciseEl && intensityEl && duration > 0) {
        estimate = calculateBurn(exerciseEl.value, intensityEl.value, duration);
    }

    document.getElementById('estimatedBurn').textContent = estimate + ' kcal';
}

async function addExercise() {
    const exerciseEl = document.querySelector('input[name="exercise"]:checked');
    const intensityEl = document.querySelector('input[name="intensity"]:checked');
    const duration = document.getElementById('duration').value;
    const distance = document.getElementById('distance').value;
    const weightMoved = document.getElementById('weightMoved').value;
    const overrideCals = document.getElementById('caloriesOverride').value;

    if (!exerciseEl) return alert('Please select an exercise type.');
    if (!duration || duration <= 0) return alert('Please enter a valid duration.');
    if (!intensityEl) return alert('Please select an intensity level.');

    let calories;
    if (overrideCals && Number(overrideCals) > 0) {
        calories = Number(overrideCals);
    } else {
        calories = calculateBurn(exerciseEl.value, intensityEl.value, Number(duration));
    }

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await  csrfRes.json();
        const res = await fetch('/api/exercise', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json','X-CSRF-Token':csrfToken },
            body: JSON.stringify({
                exercise_type: exerciseEl.value,
                duration_min: Number(duration),
                distance_km: distance ? Number(distance) : null,
                calories_burned: calories,
                weight_moved_kg: weightMoved ? Number(weightMoved) : null
            })
        });

        if (!res.ok) {
            const data = await res.json();
            return alert(data.error || 'Failed to save exercise.');
        }

        // Reset form
        exerciseEl.checked = false;
        intensityEl.checked = false;
        document.getElementById('duration').value = '';
        document.getElementById('distance').value = '';
        document.getElementById('weightMoved').value = '';
        document.getElementById('caloriesOverride').value = '';
        document.getElementById('estimatedBurn').textContent = '0 kcal';
        document.getElementById('distanceSection').style.display = 'none';
        document.getElementById('weightMovedSection').style.display = 'none';

        loadExerciseLogs();
    } catch (err) {
        alert('Error saving exercise. Is the server running?');
    }
}

async function deleteExercise(id) {
    try {
        const csrfRes = await fetch('/api/csrf-token')
        const { csrfToken } = await csrfRes.json();

        await fetch('/api/exercise/' + id, { method: 'DELETE',
        headers: {'X-CSRF-Token': csrfToken}});
        loadExerciseLogs();
    } catch (err) {
        alert('Error deleting exercise.');
    }
}

async function loadExerciseLogs() {
    try {
        const res = await fetch('/api/exercise');

        if (res.status === 401) {
            document.getElementById('exerciseLogList').innerHTML =
                '<div class="empty-state">Please <a href="login.html" style="color:var(--green); font-weight:700;">log in</a> to track exercises.</div>';
            return;
        }

        const logs = await res.json();

        const total = logs.reduce((sum, l) => sum + (l.calories_burned || 0), 0);
        document.getElementById('totalBurn').textContent = total + ' kcal';

        const listEl = document.getElementById('exerciseLogList');

        if (logs.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No exercise logged yet.</div>';
            return;
        }
        // Replace innerHTML template with:
        listEl.innerHTML = '';
        logs.forEach(log => {
            const typeName = log.exercise_type.charAt(0).toUpperCase() + log.exercise_type.slice(1);

            let detailText = '';
            if (log.distance_km) detailText = `${log.distance_km} km · `;
            if (log.weight_moved_kg) detailText = `${log.weight_moved_kg} kg moved · `;

            const div = document.createElement('div');
            div.className = 'log-entry';

            const left = document.createElement('div');
            left.className = 'entry-left';

            const tag = document.createElement('span');
            tag.className = 'meal-tag';
            tag.textContent = typeName;

            const desc = document.createElement('span');
            desc.className = 'entry-desc';
            desc.textContent = `${detailText}${log.duration_min} min`;

            left.appendChild(tag);
            left.appendChild(desc);

            const right = document.createElement('div');
            right.className = 'entry-right';

            const cals = document.createElement('span');
            cals.className = 'entry-cals';
            cals.textContent = `${log.calories_burned} kcal`;

            const btn = document.createElement('button');
            btn.className = 'delete-btn';
            btn.textContent = '×';
            btn.addEventListener('click', () => deleteExercise(log.exercise_log_id));

            right.appendChild(cals);
            right.appendChild(btn);
            div.appendChild(left);
            div.appendChild(right);
            listEl.appendChild(div);
        });

    } catch (err) {
        console.error('Error loading exercises:', err);
    }
}

loadUserWeight();
loadExerciseLogs();