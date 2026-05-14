//  Handles:
//  - Food search and calorie lookup logging
//  - Manual food entry creation and submission
//  - Daily food log display and deletion
//  - Meal type selection and tracking
//  - Live food search with debounce
//  - Total calorie tracking for the current day
//  - Modal/overlay controls for manual food entry
//
//  Supports two logging modes:
//      - Food database lookup
//      - Manual nutrition entry
//
//  Dependencies: /api/foods/search,
//                /api/foods/manual,
//                /api/food-log,
//                /api/food-log/today,
//                /api/csrf-token
// ─────────────────────────────────────────────
//  Food search uses delayed querying (debounce)
//  to reduce unnecessary API requests
// ─────────────────────────────────────────────

function showMode(mode) {
    document.getElementById('lookupSection').style.display = mode === 'lookup' ? 'block' : 'none';
    const buttons = document.querySelectorAll('.entry-mode-buttons button');
    buttons[0].classList.toggle('active', mode === 'lookup');
    buttons[1].classList.toggle('active', false);
}


function openManual() {
    const mealEl = document.querySelector('input[name="meal"]:checked');
    if (mealEl) {
        document.getElementById('m_meal_type').value = mealEl.value;
    }
    document.getElementById('manualOverlay').style.display = 'block';
    document.querySelectorAll('.entry-mode-buttons button')[1].classList.add('active');
}

function closeManual() {
    document.getElementById('manualOverlay').style.display = 'none';
    document.getElementById('manualError').style.display = 'none';
    document.querySelectorAll('.entry-mode-buttons button')[1].classList.remove('active');
}

async function submitManual() {
    const btn      = document.getElementById('manualSubmitBtn');
    const errorEl  = document.getElementById('manualError');
    errorEl.style.display = 'none';

    const food_name    = document.getElementById('m_food_name').value.trim();
    const calories     = document.getElementById('m_calories').value;
    const energy       = document.getElementById('m_energy').value;
    const protein      = document.getElementById('m_protein').value;
    const fat          = document.getElementById('m_fat').value;
    const carbs        = document.getElementById('m_carbs').value;
    const fibre        = document.getElementById('m_fibre').value;
    const sugars       = document.getElementById('m_sugars').value;
    const sodium       = document.getElementById('m_sodium').value;
    const quantity     = document.getElementById('m_quantity').value;
    const meal_type    = document.getElementById('m_meal_type').value;

    if (!food_name)  return showError('Food name is required.');
    if (!calories)   return showError('Calories are required.');
    if (!quantity)   return showError('Quantity is required.');
    if (!meal_type)  return showError('Please select a meal type.');

    function showError(msg) {
        errorEl.textContent   = msg;
        errorEl.style.display = 'block';
    }

    btn.disabled    = true;
    btn.textContent = 'Saving...';

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res  = await fetch('/api/foods/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({
                food_name, calories, energy, protein, fat, carbs,
                fibre, sugars, sodium,
                quantity_grams: quantity,
                meal_type,
                _csrf: csrfToken
            }),
        });

        const data = await res.json();

        if (!data.success) {
            showError(data.error || 'Something went wrong.');
            btn.disabled    = false;
            btn.textContent = '+ Save & Log Food';
            return;
        }

        closeManual();
        ['m_food_name','m_calories','m_energy','m_protein','m_fat',
            'm_carbs','m_fibre','m_sugars','m_sodium','m_quantity'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('m_meal_type').value = '';
        loadLogs();

    } catch (err) {
        showError('Network error. Please try again.');
    }

    btn.disabled    = false;
    btn.textContent = '+ Save & Log Food';
}

let searchTimeout;
async function searchFood() {
    const query     = document.getElementById('foodSearch').value.trim();
    const resultsEl = document.getElementById('searchResults');
    if (query.length < 2) { resultsEl.innerHTML = ''; return; }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        resultsEl.innerHTML = '<div style="padding:8px 16px;color:#888;font-size:13px;">Searching...</div>';
        try {
            const res  = await fetch('/api/foods/search?q=' + encodeURIComponent(query));
            const data = await res.json();
            const foods = data.foods || data;

            if (!foods.length) {
                resultsEl.innerHTML = '<div style="padding:8px 16px;color:#888;font-size:13px;">No results found.</div>';
                return;
            }

            resultsEl.innerHTML = '';
            foods.forEach(f => {
                const div = document.createElement('div');
                div.className = 'food-result'

                const name = document.createElement('span');
                name.textContent = f.food_name;

                const cals = document.createElement('span');

                cals.style.cssText = 'float:right;color:#888;font-weight:400;';
                cals.textContent = `${f.calories || '?'} kcal/100g`;

                div.appendChild(name);
                div.appendChild(cals);
                div.addEventListener('click', () => selectFood(f.food_id, f.food_name, f.calories || 0));
                resultsEl.appendChild(div)
            })
        } catch (err) {
            resultsEl.innerHTML = '<div style="padding:8px 16px;color:red;font-size:13px;">Search failed.</div>';
        }
    }, 400);
}

function selectFood(foodId, foodName, caloriesPer100g) {
    document.getElementById('selectedFoodId').value          = foodId;
    document.getElementById('selectedFoodName').textContent  = foodName;
    document.getElementById('selectedFoodCals').textContent  = ` — ${caloriesPer100g} kcal per 100g`;
    document.getElementById('selectedFood').style.display    = 'block';
    document.getElementById('searchResults').innerHTML       = '';
    document.getElementById('foodSearch').value             = foodName;
}

async function addLookupLog() {
    const mealEl       = document.querySelector('input[name="meal"]:checked');
    const foodId       = document.getElementById('selectedFoodId').value;
    const quantityGrams = document.getElementById('quantityGrams').value;

    if (!mealEl)                          return alert('Please select a meal type.');
    if (!foodId)                          return alert('Please search and select a food.');
    if (!quantityGrams || quantityGrams <= 0) return alert('Please enter a quantity in grams.');

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res  = await fetch('/api/food-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ food_id: foodId, quantity_grams: quantityGrams, meal_type: mealEl.value, _csrf: csrfToken }),
        });
        const data = await res.json();
        if (!data.success) return alert('Error: ' + (data.error || 'Unknown error'));

        document.getElementById('selectedFoodId').value       = '';
        document.getElementById('selectedFood').style.display = 'none';
        document.getElementById('foodSearch').value          = '';
        document.getElementById('quantityGrams').value       = '';
        document.getElementById('searchResults').innerHTML   = '';
        mealEl.checked = false;
        loadLogs();
    } catch (err) { alert('Error saving entry.'); }
}


async function deleteLog(id) {
    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        await fetch('/api/food-log/' + id, { method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken}});
        loadLogs();
    } catch (err) { alert('Error deleting entry.'); }
}

async function loadLogs() {
    try {
        const res    = await fetch('/api/food-log/today');
        const data   = await res.json();
        const entries = data.entries || [];

        document.getElementById('totalCals').textContent = (data.total_calories || 0) + ' kcal';

        const listEl = document.getElementById('logList');
        if (!entries.length) {
            listEl.innerHTML = '<div class="empty-state">No entries yet — add your first meal above.</div>';
            return;
        }

        listEl.innerHTML = '';
        entries.forEach(log => {
            const div = document.createElement('div');
            div.className = "log-entry";
            const left = document.createElement('div');
            left.className = 'entry-left';
            const mealTag = document.createElement('span');
            mealTag.className = 'meal-tag';
            mealTag.textContent = log.meal_type;
            const desc = document.createElement('span');
            desc.className = 'entry-desc';
            desc.textContent = `${log.food_name} (${log.quantity_grams}g)`;

            left.appendChild(mealTag);
            left.appendChild(desc);

            const right = document.createElement('div');
            right.className = 'entry-right';

            const cals = document.createElement('span');
            cals.className = 'entry-cals';
            cals.textContent = `${log.calories} kcal`;


            const btn = document.createElement('button');
            btn.className = 'delete-btn';
            btn.textContent = 'x';
            btn.addEventListener('click', () => deleteLog(log.f_log_id));

            right.appendChild(cals);
            right.appendChild(btn);
            div.appendChild(left);
            div.appendChild(right);
            listEl.appendChild(div);
        });
    } catch (err) { console.error('Load logs error:', err); }
}

showMode('lookup');
loadLogs();