import { loadEntries, saveEntries, requestPersistentStorage } from './store.js';

// ---------- Options shown in the day sheet ----------

const FLOWS = [
  { id: 'none', label: 'None' },
  { id: 'spotting', label: 'Spotting' },
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
];
// Spotting is tracked but doesn't count as a period day.
const PERIOD_FLOWS = new Set(['light', 'medium', 'heavy']);

const SYMPTOMS = [
  'Cramps', 'Headache', 'Bloating', 'Fatigue', 'Acne',
  'Tender breasts', 'Back pain', 'Nausea', 'Cravings', 'Trouble sleeping',
];

const MOODS = [
  { id: 'happy', label: '😊 Happy' },
  { id: 'calm', label: '😌 Calm' },
  { id: 'sad', label: '😢 Sad' },
  { id: 'irritable', label: '😠 Irritable' },
  { id: 'anxious', label: '😰 Anxious' },
];

const DEFAULT_CYCLE = 28;  // used until two periods are logged
const DEFAULT_PERIOD = 5;

// ---------- Date helpers (day numbers avoid timezone bugs) ----------

const pad = (n) => String(n).padStart(2, '0');
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const keyToDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const dayToDate = (n) => {
  const dt = new Date(n * 86400000);
  return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};
const now = new Date();
const TODAY = keyToDay(toKey(now.getFullYear(), now.getMonth(), now.getDate()));

const fmtShort = (n) => dayToDate(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtLong = (key) => dayToDate(keyToDay(key)).toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric',
});

// ---------- Cycle math ----------

function analyze(entries) {
  const days = Object.keys(entries)
    .filter((k) => PERIOD_FLOWS.has(entries[k].flow))
    .map(keyToDay)
    .sort((a, b) => a - b);

  // Group period days into periods. A gap of 1 skipped day still counts as the same period.
  const periods = [];
  for (const d of days) {
    const last = periods[periods.length - 1];
    if (last && d - last.end <= 2) last.end = d;
    else periods.push({ start: d, end: d });
  }

  const cycles = [];
  for (let i = 1; i < periods.length; i++) {
    const len = periods[i].start - periods[i - 1].start;
    if (len >= 15 && len <= 60) cycles.push(len); // ignore missed logs / odd gaps
  }

  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const recentCycles = cycles.slice(-6);
  const recentLengths = periods.slice(-6).map((p) => p.end - p.start + 1);

  const avgCycle = recentCycles.length ? avg(recentCycles) : null;
  const avgPeriod = recentLengths.length ? avg(recentLengths) : null;
  const last = periods[periods.length - 1] || null;

  // If this date has already passed, the summary shows the period as late.
  const nextStart = last ? last.start + (avgCycle ?? DEFAULT_CYCLE) : null;

  return { periods, avgCycle, avgPeriod, last, nextStart };
}

// Predicted period days (from today onward) up to a given day.
function predictedDays(stats, untilDay) {
  const set = new Set();
  if (stats.nextStart == null) return set;
  const cycle = stats.avgCycle ?? DEFAULT_CYCLE;
  const length = stats.avgPeriod ?? DEFAULT_PERIOD;
  for (let start = stats.nextStart; start <= untilDay; start += cycle) {
    for (let d = start; d < start + length; d++) {
      if (d >= TODAY) set.add(d);
    }
  }
  return set;
}

// ---------- State ----------

let entries = loadEntries();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let editingKey = null;

const $ = (id) => document.getElementById(id);

// ---------- Rendering ----------

function render() {
  const stats = analyze(entries);
  renderSummary(stats);
  renderCalendar(stats);
}

function renderSummary(stats) {
  const el = $('summary');
  if (!stats.last) {
    el.innerHTML = `
      <p class="big">Welcome 👋</p>
      <p class="muted">Tap a day and set its flow to log your first period.
      Predictions and averages appear as you log more.</p>`;
    return;
  }

  const cycleDay = TODAY - stats.last.start + 1;
  const untilNext = stats.nextStart - TODAY;
  let nextText;
  // Logged today or yesterday counts as ongoing.
  if (TODAY - stats.last.end <= 1) {
    nextText = 'Period in progress';
  } else if (untilNext > 1) {
    nextText = `Next period in <b>${untilNext} days</b> <span class="muted">(~${fmtShort(stats.nextStart)})</span>`;
  } else if (untilNext === 1) {
    nextText = 'Next period expected <b>tomorrow</b>';
  } else if (untilNext === 0) {
    nextText = 'Next period expected <b>today</b>';
  } else {
    nextText = `Period is <b>${-untilNext} day${untilNext === -1 ? '' : 's'} late</b> <span class="muted">(expected ${fmtShort(stats.nextStart)})</span>`;
  }

  const estimateNote = stats.avgCycle == null
    ? '<p class="muted small">Using a 28-day estimate until two periods are logged.</p>'
    : '';

  el.innerHTML = `
    <p class="big">Cycle day ${cycleDay}</p>
    <p>${nextText}</p>
    <div class="stats">
      <div><span class="num">${stats.avgCycle ?? '—'}</span><span class="label">avg cycle (days)</span></div>
      <div><span class="num">${stats.avgPeriod ?? '—'}</span><span class="label">avg period (days)</span></div>
      <div><span class="num">${stats.periods.length}</span><span class="label">periods logged</span></div>
    </div>
    ${estimateNote}`;
}

function renderCalendar(stats) {
  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const lastDayNum = keyToDay(toKey(viewYear, viewMonth, daysInMonth));
  const predicted = predictedDays(stats, lastDayNum);

  $('month-label').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = $('grid');
  grid.innerHTML = '';

  for (let i = 0; i < first.getDay(); i++) {
    grid.appendChild(document.createElement('span'));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = toKey(viewYear, viewMonth, d);
    const dayNum = keyToDay(key);
    const entry = entries[key];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    btn.textContent = d;
    btn.dataset.key = key;

    let label = fmtLong(key);
    if (entry && PERIOD_FLOWS.has(entry.flow)) {
      btn.classList.add('period', `flow-${entry.flow}`);
      label += `, ${entry.flow} flow`;
    } else if (entry?.flow === 'spotting') {
      btn.classList.add('spotting');
      label += ', spotting';
    } else if (predicted.has(dayNum)) {
      btn.classList.add('predicted');
      label += ', predicted period';
    }
    if (entry && (entry.symptoms?.length || entry.mood || entry.notes)) {
      btn.classList.add('has-data');
    }
    if (dayNum === TODAY) {
      btn.classList.add('today');
      btn.setAttribute('aria-current', 'date');
    }
    btn.setAttribute('aria-label', label);
    grid.appendChild(btn);
  }
}

// ---------- Day sheet ----------

function buildChips() {
  $('flow-chips').innerHTML = FLOWS.map((f) => `
    <label class="chip"><input type="radio" name="flow" value="${f.id}"><span>${f.label}</span></label>`).join('');
  $('symptom-chips').innerHTML = SYMPTOMS.map((s) => `
    <label class="chip"><input type="checkbox" name="symptom" value="${s}"><span>${s}</span></label>`).join('');
  $('mood-chips').innerHTML = MOODS.map((m) => `
    <label class="chip"><input type="checkbox" name="mood" value="${m.id}"><span>${m.label}</span></label>`).join('');

  // Mood acts like a radio button that can be un-ticked.
  $('mood-chips').addEventListener('change', (e) => {
    if (!e.target.checked) return;
    document.querySelectorAll('input[name="mood"]').forEach((i) => {
      if (i !== e.target) i.checked = false;
    });
  });
}

function openDay(key) {
  editingKey = key;
  const entry = entries[key] || {};
  $('sheet-title').textContent = fmtLong(key);

  document.querySelectorAll('input[name="flow"]').forEach((i) => {
    i.checked = i.value === (entry.flow || 'none');
  });
  document.querySelectorAll('input[name="symptom"]').forEach((i) => {
    i.checked = (entry.symptoms || []).includes(i.value);
  });
  document.querySelectorAll('input[name="mood"]').forEach((i) => {
    i.checked = i.value === entry.mood;
  });
  $('notes').value = entry.notes || '';
  $('clear-day').hidden = !entries[key];

  $('day-sheet').showModal();
}

function saveDay() {
  const flow = document.querySelector('input[name="flow"]:checked')?.value || 'none';
  const symptoms = [...document.querySelectorAll('input[name="symptom"]:checked')].map((i) => i.value);
  const mood = document.querySelector('input[name="mood"]:checked')?.value || null;
  const notes = $('notes').value.trim();

  if (flow === 'none' && !symptoms.length && !mood && !notes) {
    delete entries[editingKey];
  } else {
    entries[editingKey] = { flow, symptoms, mood, notes };
  }
  saveEntries(entries);
  render();
}

// ---------- Events ----------

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
}

function wireEvents() {
  $('prev-month').addEventListener('click', () => changeMonth(-1));
  $('next-month').addEventListener('click', () => changeMonth(1));
  $('month-label').addEventListener('click', () => {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    render();
  });

  $('grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.day');
    if (btn) openDay(btn.dataset.key);
  });

  // Swipe left/right on the calendar to change months.
  let startX = null;
  let startY = null;
  const cal = document.querySelector('.calendar');
  cal.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  cal.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMonth(dx < 0 ? 1 : -1);
    startX = null;
  });

  const sheet = $('day-sheet');
  $('day-form').addEventListener('submit', saveDay);
  $('cancel').addEventListener('click', () => sheet.close());
  const confirmBox = $('confirm-clear');
  $('clear-day').addEventListener('click', () => confirmBox.showModal());
  $('confirm-cancel').addEventListener('click', () => confirmBox.close());
  $('confirm-ok').addEventListener('click', () => {
    delete entries[editingKey];
    saveEntries(entries);
    render();
    confirmBox.close();
    sheet.close();
  });
  confirmBox.addEventListener('click', (e) => {
    if (e.target === confirmBox) confirmBox.close();
  });
  // Tap outside the sheet to close it.
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close();
  });
}

// ---------- Start ----------

buildChips();
wireEvents();
render();
requestPersistentStorage();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
