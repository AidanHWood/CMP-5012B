// ─────────────────────────────────────────────
//  GOAL CONFIG
// ─────────────────────────────────────────────
const GOAL_CONFIG = {
    water:       { label: 'Water',       unit: 'ml',    isTime: false, higherIsBetter: true,  targetHint: 'e.g. 2000 ml',  currentHint: 'e.g. 1500 ml' },
    steps:       { label: 'Steps',       unit: 'steps', isTime: false, higherIsBetter: true,  targetHint: 'e.g. 10000',    currentHint: 'e.g. 7500' },
    weight_loss: { label: 'Weight Loss', unit: 'kg',    isTime: false, higherIsBetter: false, targetHint: 'e.g. 10 kg',    currentHint: 'e.g. 4.5 kg' },
    custom:      { label: 'Custom',      unit: '',      isTime: false, higherIsBetter: true,  targetHint: 'Enter target',  currentHint: 'Enter current' },
    calorie_intake:        { label: 'Calorie Intake', unit: 'kcal', isTime: false, higherIsBetter: false },
    gym_weight_moved_week: { label: 'Gym',            unit: 'kg',   isTime: false, higherIsBetter: true },
};

function getGoalCfg(t) {
    if (GOAL_CONFIG[t]) return GOAL_CONFIG[t];
    if (t.includes('_sessions_week')) return { label: cap(t.replace('_sessions_week','')), unit:'sessions', isTime:false, higherIsBetter:true };
    if (t.includes('_distance_week')) return { label: cap(t.replace('_distance_week','')), unit:'km', isTime:false, higherIsBetter:true, isDistance:true };
    if (t.includes('_time_')) { const p=t.split('_time_'); return { label:`${cap(p[0])} ${p[1]||''}`, unit:'', isTime:true, higherIsBetter:false }; }
    return { label:'Goal', unit:'', isTime:false, higherIsBetter:true };
}
function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }

// ─── Helpers ─────────────────────────────────
function timeToSec(s) { if(!s)return 0; const p=s.replace('.',':').split(':').map(Number); if(p.length===3)return(p[0]||0)*3600+(p[1]||0)*60+(p[2]||0); if(p.length===2)return(p[0]||0)*60+(p[1]||0); return parseFloat(s)||0; }
function secToTime(s) { const t=Math.round(parseFloat(s)); const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),sec=t%60; if(h>0)return`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; return`${m}:${String(sec).padStart(2,'0')}`; }
function fmtVal(v,c) { if(v===null||v===undefined||v==='')return'—'; const n=parseFloat(v); if(isNaN(n))return'—'; if(c.isTime)return secToTime(n); if(c.isDistance)return`${(n/10).toFixed(1)} ${c.unit}`; return c.unit?`${n.toLocaleString()} ${c.unit}`:`${n.toLocaleString()}`; }
function calcProg(a,g,c) { const A=parseFloat(a),G=parseFloat(g); if(!A||!G||isNaN(A)||isNaN(G))return 0; if(c.isTime)return Math.min(100,Math.round((G/A)*100)); if(c.higherIsBetter)return Math.min(100,Math.round((A/G)*100)); return Math.min(100,Math.round((G/A)*100)); }
function showMsg(id,txt,err=false) { const el=document.getElementById(id); if(!el)return; el.textContent=txt; el.className='feedback-msg '+(err?'error':'success'); el.style.display='block'; setTimeout(()=>{el.style.display='none';},3500); }
function fmtDate(d) { if(!d)return''; return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
function gIcon(t) { if(t.includes('running'))return'🏃'; if(t.includes('swimming'))return'🏊'; if(t.includes('cycling'))return'🚴'; if(t.includes('walking'))return'🚶'; if(t.includes('gym'))return'🏋️'; if(t.includes('calorie'))return'🔥'; if(t==='water')return'💧'; if(t==='steps')return'👟'; if(t==='weight_loss')return'⚖️'; return'🎯'; }

// ─── BMR Calculation (Mifflin-St Jeor) ──────
function calcBMR(w,h,age,gender) { if(gender==='female')return(10*w)+(6.25*h)-(5*age)-161; return(10*w)+(6.25*h)-(5*age)+5; }
function calcCalGoals(bmr,factor) { const t=Math.round(bmr*factor); return { cut_extreme:Math.max(1200,t-1000), cut_moderate:Math.max(1200,t-500), maintain:t, bulk_moderate:t+250, bulk_extreme:t+500 }; }

const EXERCISE_LABELS = { swimming:'Swimming', running:'Running', cycling:'Cycling', walking:'Walking', gym:'Gym' };
const DIST_TYPES = ['swimming','running','cycling','walking'];

// ─── State ───────────────────────────────────
let selectedAddType = null;
let settingsCalorieVal = null;
let settingsSelectedExercises = new Set();
let settingsExGoalConfigs = {};

// ═══════════════════════════════════════════════
//  GOAL TYPE SELECTOR
// ═══════════════════════════════════════════════
function selectGoalType(el, type) {
    document.querySelectorAll('.goal-type-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedAddType = type;

    document.getElementById('simpleGoalForm').style.display = 'none';
    document.getElementById('calorieSetupForm').style.display = 'none';
    document.getElementById('exerciseSetupForm').style.display = 'none';

    if (type === 'calorie_setup') {
        document.getElementById('calorieSetupForm').style.display = 'block';
    } else if (type === 'exercise_setup') {
        document.getElementById('exerciseSetupForm').style.display = 'block';
    } else {
        const cfg = GOAL_CONFIG[type];
        const form = document.getElementById('simpleGoalForm');
        form.style.display = 'block';
        document.getElementById('goal-name').value = '';
        document.getElementById('goal-target').value = '';
        document.getElementById('goal-current').value = '';
        document.getElementById('goal-deadline').value = '';
        document.getElementById('goal-target').placeholder = cfg?.targetHint || 'Enter target';
        document.getElementById('goal-current').placeholder = cfg?.currentHint || 'Enter current';
        document.getElementById('goal-target-label').textContent = `Target (${cfg?.unit || 'value'})`;
        document.getElementById('goal-current-label').textContent = `Current Progress (${cfg?.unit || 'value'})`;
    }
}

// ═══════════════════════════════════════════════
//  CALORIE SETUP (Settings version of Phase 1)
// ═══════════════════════════════════════════════
async function settingsSelectActivity(el, factor) {
    document.querySelectorAll('#settingsActivityOptions .activity-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');

    // Get user's height/weight/age from the form fields
    const h = parseFloat(document.getElementById('height_cm').value) || 0;
    const w = parseFloat(document.getElementById('weight_kg').value) || 0;
    const age = parseInt(document.getElementById('age').value) || 25;
    const sex = document.querySelector('input[name="sex"]:checked')?.value || 'male';

    if (!h || !w) {
        showMsg('calorie-setup-msg', 'Please fill in your height and weight above first.', true);
        return;
    }

    const bmr = calcBMR(w, h, age, sex);
    const goals = calcCalGoals(bmr, factor);

    document.getElementById('settingsBmrInfo').style.display = 'block';
    document.getElementById('settingsMaintenanceCals').textContent = goals.maintain;
    document.getElementById('sCutExtreme').textContent = goals.cut_extreme;
    document.getElementById('sCutModerate').textContent = goals.cut_moderate;
    document.getElementById('sMaintain').textContent = goals.maintain;
    document.getElementById('sBulkModerate').textContent = goals.bulk_moderate;
    document.getElementById('sBulkExtreme').textContent = goals.bulk_extreme;

    document.getElementById('settingsCalorieTitle').style.display = 'block';
    document.getElementById('settingsCalorieGoals').classList.add('visible');
    document.querySelectorAll('#settingsCalorieGoals .calorie-card').forEach(c => c.classList.remove('selected'));
    settingsCalorieVal = null;
    document.getElementById('save-calorie-goal-btn').disabled = true;
}

function settingsSelectCalorie(el, type) {
    document.querySelectorAll('#settingsCalorieGoals .calorie-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    settingsCalorieVal = Number(el.querySelector('.calorie-card-value').textContent);
    document.getElementById('save-calorie-goal-btn').disabled = false;
}

async function saveSettingsCalorieGoal() {
    if (!settingsCalorieVal) return;
    const btn = document.getElementById('save-calorie-goal-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ goal_type: 'calorie_intake', target_val: settingsCalorieVal, _csrf: csrfToken })
        });
        if (res.ok) {
            showMsg('calorie-setup-msg', '✓ Calorie goal saved!');
            document.getElementById('calorieSetupForm').style.display = 'none';
            document.querySelectorAll('.goal-type-card').forEach(c => c.classList.remove('selected'));
            loadGoals();
        } else {
            showMsg('calorie-setup-msg', 'Failed to save.', true);
        }
    } catch { showMsg('calorie-setup-msg', 'Network error.', true); }
    btn.disabled = false; btn.textContent = 'Save Calorie Goal';
}

// ═══════════════════════════════════════════════
//  EXERCISE SETUP (Settings version of Phase 2)
// ═══════════════════════════════════════════════
function settingsToggleExercise(el, type) {
    el.classList.toggle('selected');
    if (settingsSelectedExercises.has(type)) {
        settingsSelectedExercises.delete(type);
        delete settingsExGoalConfigs[type];
    } else {
        settingsSelectedExercises.add(type);
        settingsExGoalConfigs[type] = { goalType:'sessions', sessions:null, distance:null, weight_moved:null, timeGoals:[] };
    }
    renderSettingsExConfigs();
    document.getElementById('save-exercise-goals-btn').disabled = settingsSelectedExercises.size === 0;
}

function renderSettingsExConfigs() {
    const container = document.getElementById('settingsExerciseConfigs');
    if (settingsSelectedExercises.size === 0) {
        container.innerHTML = '<p class="no-exercises-selected">Select an exercise above to set a goal.</p>';
        return;
    }
    let html = '';
    for (const type of settingsSelectedExercises) {
        const label = EXERCISE_LABELS[type];
        const isGym = type === 'gym';
        const isDist = DIST_TYPES.includes(type);
        const cfg = settingsExGoalConfigs[type];

        html += `<div class="exercise-goal-config"><h4>${label} Goal</h4><div class="goal-type-tabs">
            <button type="button" class="goal-type-tab ${cfg.goalType==='sessions'?'active':''}" onclick="setSettingsExType('${type}','sessions')">Sessions/Week</button>`;
        if (isDist) html += `<button type="button" class="goal-type-tab ${cfg.goalType==='distance'?'active':''}" onclick="setSettingsExType('${type}','distance')">Distance/Week</button>
            <button type="button" class="goal-type-tab ${cfg.goalType==='time'?'active':''}" onclick="setSettingsExType('${type}','time')">Target Time</button>`;
        if (isGym) html += `<button type="button" class="goal-type-tab ${cfg.goalType==='weight_moved'?'active':''}" onclick="setSettingsExType('${type}','weight_moved')">Weight Moved/Week</button>`;
        html += `</div>`;

        if (cfg.goalType === 'sessions') {
            html += `<div class="goal-input-row"><label>Sessions</label><input type="number" min="1" max="14" placeholder="e.g. 3" value="${cfg.sessions||''}" onchange="settingsExGoalConfigs['${type}'].sessions=Number(this.value)"><span style="font-size:13px;color:var(--muted)">per week</span></div>`;
        } else if (cfg.goalType === 'distance') {
            html += `<div class="goal-input-row"><label>Distance</label><input type="number" min="0.1" step="0.1" placeholder="e.g. 15" value="${cfg.distance||''}" onchange="settingsExGoalConfigs['${type}'].distance=Number(this.value)"><span style="font-size:13px;color:var(--muted)">km per week</span></div>`;
        } else if (cfg.goalType === 'weight_moved') {
            html += `<div class="goal-input-row"><label>Weight</label><input type="number" min="1" step="1" placeholder="e.g. 5000" value="${cfg.weight_moved||''}" onchange="settingsExGoalConfigs['${type}'].weight_moved=Number(this.value)"><span style="font-size:13px;color:var(--muted)">kg per week</span></div>`;
        } else if (cfg.goalType === 'time') {
            const tg = cfg.timeGoals || [];
            html += `<div class="time-goal-group">`;
            for (let i = 0; i < tg.length; i++) {
                html += `<div class="time-goal-entry"><label>Distance</label><div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" onclick="sAdjDist('${type}',${i},-0.5)" style="width:28px;height:28px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">−</button>
                    <input type="number" min="0.1" step="0.5" value="${tg[i].distance||1}" style="width:65px;text-align:center;" onchange="settingsExGoalConfigs['${type}'].timeGoals[${i}].distance=Number(this.value)">
                    <button type="button" onclick="sAdjDist('${type}',${i},0.5)" style="width:28px;height:28px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">+</button>
                    <span style="font-size:13px;color:var(--muted)">km</span></div>
                    <label style="margin-left:10px;">Target</label>
                    <input type="text" placeholder="HH:MM.SS" value="${tg[i].time||''}" style="width:100px;" onchange="settingsExGoalConfigs['${type}'].timeGoals[${i}].time=this.value">
                    <button type="button" class="remove-distance-btn" onclick="sRemoveTime('${type}',${i})">✕</button></div>`;
            }
            if (tg.length < 3) html += `<button type="button" class="add-distance-btn" onclick="sAddTime('${type}')">+ Add distance (${tg.length}/3)</button>`;
            html += `</div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

function setSettingsExType(type, goalType) {
    settingsExGoalConfigs[type].goalType = goalType;
    if (goalType === 'time' && settingsExGoalConfigs[type].timeGoals.length === 0) settingsExGoalConfigs[type].timeGoals = [{ distance: 5, time: '' }];
    renderSettingsExConfigs();
}
function sAddTime(type) { if(settingsExGoalConfigs[type].timeGoals.length>=3)return; settingsExGoalConfigs[type].timeGoals.push({distance:5,time:''}); renderSettingsExConfigs(); }
function sRemoveTime(type, i) { settingsExGoalConfigs[type].timeGoals.splice(i,1); renderSettingsExConfigs(); }
function sAdjDist(type, i, d) { settingsExGoalConfigs[type].timeGoals[i].distance=Math.max(0.5,(settingsExGoalConfigs[type].timeGoals[i].distance||1)+d); renderSettingsExConfigs(); }

async function saveSettingsExerciseGoals() {
    const btn = document.getElementById('save-exercise-goals-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    const goals = [];
    for (const type of settingsSelectedExercises) {
        const c = settingsExGoalConfigs[type];
        if (c.sessions) goals.push({ goal_type:`${type}_sessions_week`, target_val:Math.round(c.sessions) });
        if (c.distance && DIST_TYPES.includes(type)) goals.push({ goal_type:`${type}_distance_week`, target_val:Math.round(c.distance*10) });
        if (c.weight_moved && type==='gym') goals.push({ goal_type:'gym_weight_moved_week', target_val:Math.round(c.weight_moved) });
        if (c.timeGoals) for (const tg of c.timeGoals) { if(tg.distance&&tg.time) { const s=timeToSec(tg.time); if(s>0) goals.push({goal_type:`${type}_time_${tg.distance}km`,target_val:s}); } }
    }
    if (!goals.length) { showMsg('exercise-setup-msg','Please fill in at least one goal.',true); btn.disabled=false; btn.textContent='Save Exercise Goals'; return; }
    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch('/api/goals/batch', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken}, body:JSON.stringify({goals,_csrf:csrfToken}) });
        if (res.ok) {
            showMsg('exercise-setup-msg','✓ Exercise goals saved!');
            document.getElementById('exerciseSetupForm').style.display = 'none';
            document.querySelectorAll('.goal-type-card').forEach(c=>c.classList.remove('selected'));
            settingsSelectedExercises.clear(); settingsExGoalConfigs = {};
            loadGoals();
        } else { showMsg('exercise-setup-msg','Failed to save.',true); }
    } catch { showMsg('exercise-setup-msg','Network error.',true); }
    btn.disabled = false; btn.textContent = 'Save Exercise Goals';
}

// ═══════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════
async function loadProfile() {
    try {
        const res = await fetch('/api/user-profile');
        if (!res.ok) return;
        const d = await res.json();
        document.getElementById('banner-username').textContent = d.username||'User';
        document.getElementById('real_name').value = d.real_name||'';
        document.getElementById('username').value = d.username||'';
        document.getElementById('email').value = d.email||'';
        document.getElementById('age').value = d.age||'';
        document.getElementById('height_cm').value = d.height_cm||'';
        document.getElementById('weight_kg').value = d.weight_kg||'';
        document.getElementById('calorie_goal').value = d.calorie_goal||'';
        document.getElementById('weekly_exercise_goal').value = d.weekly_exercise_goal||'';
        if(d.sex){const el=document.querySelector(`input[name="sex"][value="${d.sex}"]`);if(el)el.checked=true;}
        if(d.units){const el=document.querySelector(`input[name="units"][value="${d.units}"]`);if(el)el.checked=true;}
    } catch(e){console.error('Load profile:',e);}
}

async function saveProfile() {
    const body = { real_name:document.getElementById('real_name').value.trim()||null, email:document.getElementById('email').value.trim()||null, age:document.getElementById('age').value||null, height_cm:document.getElementById('height_cm').value||null, weight_kg:document.getElementById('weight_kg').value||null, sex:document.querySelector('input[name="sex"]:checked')?.value||null };
    try { const res=await fetch('/api/user-profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); showMsg('profile-msg',res.ok?'✓ Saved!':'Failed.',!res.ok); if(res.ok)loadProfile(); } catch{showMsg('profile-msg','Network error.',true);}
}

async function savePreferences() {
    const body = { calorie_goal:document.getElementById('calorie_goal').value||null, weekly_exercise_goal:document.getElementById('weekly_exercise_goal').value||null, units:'metric'};
    try { const res=await fetch('/api/user-profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); showMsg('prefs-msg',res.ok?'✓ Saved!':'Failed.',!res.ok); } catch{showMsg('prefs-msg','Network error.',true);}
}

// ═══════════════════════════════════════════════
//  GOALS — load and render
// ═══════════════════════════════════════════════
async function loadGoals() {
    try {
        let res = await fetch('/api/goals-with-progress');
        if (!res.ok) res = await fetch('/api/goals');
        if (!res.ok) return;
        const data = await res.json();
        renderGoals(data.goals || []);
    } catch(e){console.error('Load goals:',e);}
}

function renderGoals(goals) {
    const list = document.getElementById('goal-list');
    if (!goals.length) { list.innerHTML='<div class="empty-state">No active goals yet. Add one below!</div>'; return; }
    list.innerHTML = goals.map(g => {
        const c=getGoalCfg(g.goal_type), gv=Number(g.goal_value)||0, av=Number(g.actual_value)||0;
        const prog=calcProg(av,gv,c), gs=fmtVal(gv,c), as=fmtVal(av,c);
        const dl=fmtDate(g.deadline), nm=g.goal_name||c.label, ic=gIcon(g.goal_type), hint=c.isTime?'HH:MM:SS':(c.unit||'value');
        const auto=g.goal_type.includes('_sessions_week')||g.goal_type.includes('_distance_week')||g.goal_type==='gym_weight_moved_week'||g.goal_type==='calorie_intake';
        return `<div class="goal-entry" data-id="${g.goal_id}" data-type="${g.goal_type}"><div class="goal-entry-left">
            <span class="goal-tag">${ic} ${c.label}</span><span class="goal-name">${nm}</span>
            <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${prog}%;"></div></div>
            <span class="goal-meta">${as} of ${gs} · ${prog}%</span>
            ${auto?'<span class="goal-auto-badge">✓ Auto-tracked from your logs</span>'
            :`<div class="goal-update-row"><input type="text" class="progress-input" placeholder="Update (${hint})" data-goal-id="${g.goal_id}" data-goal-type="${g.goal_type}" /><button type="button" class="update-btn" data-goal-id="${g.goal_id}" data-goal-type="${g.goal_type}">Update</button></div>`}
        </div><div class="goal-entry-right">${dl?`<span class="goal-date">${dl}</span>`:''}<button type="button" class="delete-btn" data-goal-id="${g.goal_id}">×</button></div></div>`;
    }).join('');
}

// ═══════════════════════════════════════════════
//  GOALS — simple add, update, delete
// ═══════════════════════════════════════════════
async function addSimpleGoal() {
    if (!selectedAddType || selectedAddType==='calorie_setup'||selectedAddType==='exercise_setup') return showMsg('goal-add-msg','Please select a goal type.',true);
    const nm=document.getElementById('goal-name').value.trim(), tr=document.getElementById('goal-target').value.trim(), cr=document.getElementById('goal-current').value.trim(), dl=document.getElementById('goal-deadline').value;
    if(!nm)return showMsg('goal-add-msg','Enter a goal name.',true);
    if(!tr)return showMsg('goal-add-msg','Enter a target.',true);
    const cfg=GOAL_CONFIG[selectedAddType]||{isTime:false};
    const gv=cfg.isTime?timeToSec(tr):parseFloat(tr), av=cr?(cfg.isTime?timeToSec(cr):parseFloat(cr)):0;
    if(isNaN(gv)||gv<=0)return showMsg('goal-add-msg','Invalid target.',true);
    try {
        const csrfRes=await fetch('/api/csrf-token'); const{csrfToken}=await csrfRes.json();
        const res=await fetch('/api/goals',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify({goal_type:selectedAddType,goal_name:nm,goal_value:gv,actual_value:av,deadline:dl||null,_csrf:csrfToken})});
        if(res.ok){showMsg('goal-add-msg','✓ Goal added!');document.getElementById('goal-name').value='';document.getElementById('goal-target').value='';document.getElementById('goal-current').value='';document.getElementById('goal-deadline').value='';document.getElementById('simpleGoalForm').style.display='none';document.querySelectorAll('.goal-type-card').forEach(c=>c.classList.remove('selected'));selectedAddType=null;loadGoals();}
        else{const e=await res.json();showMsg('goal-add-msg',e.error||'Failed.',true);}
    }catch{showMsg('goal-add-msg','Network error.',true);}
}

async function updateGoalProgress(goalId, goalType) {
    const row=document.querySelector(`[data-id="${goalId}"]`), input=row?.querySelector('.progress-input');
    if(!input||!input.value.trim())return;
    const c=getGoalCfg(goalType), nv=c.isTime?timeToSec(input.value.trim()):parseFloat(input.value.trim());
    if(isNaN(nv)){input.style.borderColor='#d11a2a';setTimeout(()=>{input.style.borderColor='';},1500);return;}
    try{const csrfRes=await fetch('/api/csrf-token');const{csrfToken}=await csrfRes.json();const res=await fetch(`/api/goals/${goalId}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify({actual_value:nv})});if(res.ok){input.value='';loadGoals();}}catch(e){console.error('Update:',e);}
}

async function deleteGoal(goalId) {
    if(!confirm('Delete this goal?'))return;
    try{const csrfRes=await fetch('/api/csrf-token');const{csrfToken}=await csrfRes.json();const res=await fetch(`/api/goals/${goalId}`,{method:'DELETE',headers:{'X-CSRF-Token':csrfToken}});if(res.ok)loadGoals();}catch(e){console.error('Delete:',e);}
}

// ═══════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-goal-btn')?.addEventListener('click', addSimpleGoal);
    document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
    document.getElementById('save-prefs-btn')?.addEventListener('click', savePreferences);

    const gl = document.getElementById('goal-list');
    if (gl) {
        gl.addEventListener('click', e => {
            const u=e.target.closest('.update-btn'), d=e.target.closest('.delete-btn');
            if(u)updateGoalProgress(u.dataset.goalId,u.dataset.goalType);
            if(d)deleteGoal(d.dataset.goalId);
        });
        gl.addEventListener('keydown', e => { if(e.key==='Enter'&&e.target.classList.contains('progress-input'))updateGoalProgress(e.target.dataset.goalId,e.target.dataset.goalType); });
    }

    document.querySelectorAll('.logoutBtn').forEach(btn => {
        btn.addEventListener('click', async(e) => { e.preventDefault(); try{await fetch('/logout',{method:'POST',credentials:'same-origin'});}catch{}window.location.href='/login'; });
    });

    document.querySelector('.delete-account-btn')?.addEventListener('click', deleteAccount);

    loadProfile();
    loadGoals();
});

// ═══════════════════════════════════════════════
//  DELETE ACCOUNT
// ═══════════════════════════════════════════════
async function deleteAccount() {
    const confirmed = confirm(
        'Are you sure you want to delete your account?\n\n' +
        'This will permanently delete all your data including food logs, ' +
        'exercise history, weight logs, and goals.\n\n' +
        'This cannot be undone.'
    );
    if (!confirmed) return;

    const doubleConfirmed = confirm('Last chance — are you absolutely sure?');
    if (!doubleConfirmed) return;

    try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();

        const res = await fetch('/api/account', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': csrfToken },
        });

        const data = await res.json();

        if (data.success) {
            window.location.href = '/homepage.html';
        } else {
            alert(data.error || 'Failed to delete account. Please try again.');
        }
    } catch (err) {
        console.error('Delete account error:', err);
        alert('Network error. Please try again.');
    }
}