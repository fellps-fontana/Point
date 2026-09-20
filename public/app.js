const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899',
  '#8b5cf6', '#84cc16', '#f97316', '#14b8a6', '#eab308', '#3b82f6',
];

let currentUser = null;
let currentStatus = null;
let currentRange = 'daily';
let projectsCache = [];
let lastReportData = null;
const hiddenProjectIds = new Set();

let selectedIcon = 'briefcase';
let selectedColor = PALETTE[0];

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('nao autenticado');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `erro na requisicao (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtElapsed(startIso) {
  const start = new Date(startIso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const s = String(diffSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtHoursExact(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ---------- Relogio / status ----------

function renderStatus() {
  const timerEl = document.getElementById('elapsedTimer');
  const labelEl = document.getElementById('elapsedLabel');
  const stopBtn = document.getElementById('stopBtn');

  if (currentStatus && currentStatus.open) {
    const open = currentStatus.open;
    timerEl.textContent = fmtElapsed(open.start_time);
    timerEl.className = 'elapsed-timer is-running';
    timerEl.style.color = open.project_color;
    labelEl.innerHTML = `<span class="status-dot" style="background:${open.project_color}"></span> ${escapeHtml(open.project_name)}`;
    stopBtn.style.display = 'inline-block';
  } else {
    timerEl.textContent = '00:00:00';
    timerEl.className = 'elapsed-timer is-idle';
    timerEl.style.color = '';
    labelEl.textContent = 'Nenhum ponto ativo';
    stopBtn.style.display = 'none';
  }
}

function tickElapsed() {
  if (!currentStatus || !currentStatus.open) return;
  const timerEl = document.getElementById('elapsedTimer');
  if (timerEl) timerEl.textContent = fmtElapsed(currentStatus.open.start_time);
}

function tickWallClock() {
  const el = document.getElementById('wallClock');
  if (!el) return;
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  el.textContent = formatted;
}

async function loadStatus() {
  currentStatus = await api('/api/clock/status');
  renderStatus();
  renderProjects();
}

// ---------- Projetos ----------

function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  if (projectsCache.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhum projeto cadastrado ainda.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const p of projectsCache) {
    const btn = document.createElement('button');
    const isActive = currentStatus && currentStatus.open && currentStatus.open.project_id === p.id;
    btn.className = 'project-btn' + (isActive ? ' active-project' : '');
    btn.style.color = p.color;
    btn.innerHTML = `<span class="project-icon" style="color:${p.color}">${iconSvg(p.icon, 16)}</span><span style="color:var(--text)">${escapeHtml(p.name)}</span>`;
    btn.addEventListener('click', () => punch(p.id));
    grid.appendChild(btn);
  }
}

async function loadProjects() {
  projectsCache = await api('/api/projects');
  renderProjects();
}

async function punch(projectId) {
  await api(`/api/clock/${projectId}`, { method: 'POST' });
  await loadStatus();
  loadChart(currentRange, { keepRange: true });
}

async function stopCurrent() {
  await api('/api/clock/stop/current', { method: 'POST' });
  await loadStatus();
  loadChart(currentRange, { keepRange: true });
}

// ---------- Filtro de projetos no grafico ----------

function renderFilterChips(projects) {
  const box = document.getElementById('filterChips');
  if (!projects || projects.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '';
  for (const p of projects) {
    const chip = document.createElement('button');
    const isHidden = hiddenProjectIds.has(p.id);
    chip.className = 'filter-chip' + (isHidden ? ' disabled' : '');
    chip.style.color = p.color;
    chip.innerHTML = `${iconSvg(p.icon, 13)} ${escapeHtml(p.name)}`;
    chip.addEventListener('click', () => {
      if (hiddenProjectIds.has(p.id)) hiddenProjectIds.delete(p.id);
      else hiddenProjectIds.add(p.id);
      renderFilterChips(projects);
      if (lastReportData) renderChart(lastReportData);
    });
    box.appendChild(chip);
  }
}

// ---------- Graficos ----------

const CHART_HEIGHT = 220;

function barDims(bucketCount) {
  if (bucketCount <= 14) return { width: 36, gap: 22 };
  if (bucketCount <= 31) return { width: 22, gap: 12 };
  return { width: 12, gap: 6 };
}

function shortLabel(bucket, range) {
  // no semanal o label vem como "dd/mm-dd/mm", muito largo pra caber embaixo da barra
  if (range === 'weekly') return bucket.label.split('-')[0];
  return bucket.label;
}

function visibleProjects(projects) {
  return projects.filter((p) => !hiddenProjectIds.has(p.id));
}

function renderPie(data) {
  const area = document.getElementById('chartArea');
  const projects = visibleProjects(data.projects);
  const bucket = data.buckets[0];
  const rows = bucket.values
    .filter((v) => projects.some((p) => p.id === v.projectId) && v.hours > 0)
    .map((v) => ({ ...v, project: projects.find((p) => p.id === v.projectId) }))
    .sort((a, b) => b.hours - a.hours);

  const total = rows.reduce((sum, r) => sum + r.hours, 0);

  if (rows.length === 0 || total === 0) {
    area.innerHTML = '<div class="empty-state">Nenhuma hora registrada hoje ainda.</div>';
    return;
  }

  const size = 180;
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  let circles = '';
  for (const row of rows) {
    const fraction = row.hours / total;
    const dash = fraction * circumference;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${row.project.color}" stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${escapeHtml(row.project.name)}: ${fmtHoursExact(row.hours)}</title></circle>`;
    offset += dash;
  }

  const totalLabel = fmtHoursExact(total);

  const svg = `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform: rotate(-90deg)">
      ${circles}
    </svg>
  `;

  const breakdown = rows
    .map((row) => {
      const pct = ((row.hours / total) * 100).toFixed(0);
      return `
        <div class="pie-row">
          <span class="pie-icon" style="background:${row.project.color}22; color:${row.project.color}">${iconSvg(row.project.icon, 15)}</span>
          <span class="pie-name">${escapeHtml(row.project.name)}</span>
          <span class="pie-hours">${fmtHoursExact(row.hours)}</span>
          <span class="pie-pct">${pct}%</span>
        </div>
      `;
    })
    .join('');

  area.innerHTML = `
    <div class="pie-wrap">
      <div style="position:relative; width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;">
        ${svg}
        <div style="position:absolute; text-align:center;">
          <div style="font-size:20px; font-weight:800;">${totalLabel}</div>
          <div style="font-size:11px; color:var(--text-dim);">hoje</div>
        </div>
      </div>
      <div class="pie-breakdown">${breakdown}</div>
    </div>
  `;
}

function renderBars(data) {
  const area = document.getElementById('chartArea');
  const projects = visibleProjects(data.projects);
  const buckets = data.buckets;

  const anyHours = buckets.some((b) => b.values.some((v) => projects.some((p) => p.id === v.projectId) && v.hours > 0));
  if (!anyHours) {
    area.innerHTML = '<div class="empty-state">Sem horas registradas nesse periodo ainda.</div>';
    return;
  }

  const maxTotal = Math.max(
    1,
    ...buckets.map((b) => b.values.filter((v) => projects.some((p) => p.id === v.projectId)).reduce((sum, v) => sum + v.hours, 0))
  );

  const { width: barWidth, gap } = barDims(buckets.length);
  const width = buckets.length * (barWidth + gap) + gap;
  const height = CHART_HEIGHT;
  const bottomPad = 26;
  const topPad = 10;
  const usableHeight = height - bottomPad - topPad;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px; display:block; margin:0 auto;">`;

  buckets.forEach((bucket, i) => {
    const x = gap + i * (barWidth + gap);
    let yCursor = height - bottomPad;
    const values = bucket.values.filter((v) => projects.some((p) => p.id === v.projectId));
    const total = values.reduce((sum, v) => sum + v.hours, 0);

    for (const v of values) {
      if (v.hours <= 0) continue;
      const proj = projects.find((p) => p.id === v.projectId);
      const barHeight = (v.hours / maxTotal) * usableHeight;
      yCursor -= barHeight;
      svg += `<rect x="${x}" y="${yCursor.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" fill="${proj ? proj.color : '#666'}" rx="2">`;
      svg += `<title>${escapeHtml(proj ? proj.name : '')}: ${fmtHoursExact(v.hours)}</title>`;
      svg += `</rect>`;
    }

    if (total > 0) {
      const labelY = Math.max(10, yCursor - 6);
      svg += `<text x="${x + barWidth / 2}" y="${labelY.toFixed(1)}" font-size="10" fill="#9096a8" text-anchor="middle">${fmtHoursExact(total)}</text>`;
    }

    svg += `<text x="${x + barWidth / 2}" y="${height - 8}" font-size="10" fill="#9096a8" text-anchor="middle">${escapeHtml(shortLabel(bucket, data.range))}<title>${escapeHtml(bucket.label)}</title></text>`;
  });

  svg += `</svg>`;
  area.innerHTML = svg;
}

function renderChart(data) {
  if (data.range === 'daily') renderPie(data);
  else renderBars(data);
}

async function loadChart(range, opts = {}) {
  currentRange = range;
  let url = `/api/reports/${range}`;
  if (range === 'custom') {
    const start = document.getElementById('customStart').value;
    const end = document.getElementById('customEnd').value;
    if (!start || !end) return;
    url += `?start=${start}&end=${end}`;
  }
  const data = await api(url);
  lastReportData = data;
  if (!opts.keepRange) hiddenProjectIds.clear();
  renderFilterChips(data.projects);
  renderChart(data);
}

// ---------- Modais ----------

function renderIconGrid() {
  const grid = document.getElementById('iconGrid');
  grid.innerHTML = '';
  for (const name of ICON_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-option' + (name === selectedIcon ? ' selected' : '');
    btn.innerHTML = iconSvg(name, 18);
    btn.addEventListener('click', () => {
      selectedIcon = name;
      renderIconGrid();
    });
    grid.appendChild(btn);
  }
}

function renderSwatchGrid() {
  const grid = document.getElementById('swatchGrid');
  grid.innerHTML = '';
  for (const color of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch-option' + (color === selectedColor ? ' selected' : '');
    btn.style.background = color;
    btn.addEventListener('click', () => {
      selectedColor = color;
      renderSwatchGrid();
    });
    grid.appendChild(btn);
  }
}

function setupProjectModal() {
  const modal = document.getElementById('projectModal');
  document.getElementById('newProjectBtn').addEventListener('click', () => {
    document.getElementById('projectNameInput').value = '';
    selectedIcon = 'briefcase';
    selectedColor = PALETTE[0];
    renderIconGrid();
    renderSwatchGrid();
    modal.style.display = 'flex';
  });
  document.getElementById('cancelProjectBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('saveProjectBtn').addEventListener('click', async () => {
    const name = document.getElementById('projectNameInput').value.trim();
    if (!name) return;
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, color: selectedColor, icon: selectedIcon }),
    });
    modal.style.display = 'none';
    await loadProjects();
    loadChart(currentRange, { keepRange: true });
  });
}

async function refreshUsersList() {
  const users = await api('/api/auth/users');
  const list = document.getElementById('usersList');
  list.innerHTML = users
    .map((u) => `<div class="user-row"><span>${escapeHtml(u.username)}</span></div>`)
    .join('');
}

function setupUsersModal() {
  const modal = document.getElementById('usersModal');
  document.getElementById('usersBtn').addEventListener('click', async () => {
    document.getElementById('userErrorMsg').textContent = '';
    document.getElementById('newUsernameInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    modal.style.display = 'flex';
    await refreshUsersList();
  });
  document.getElementById('closeUsersBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('createUserBtn').addEventListener('click', async () => {
    const errorMsg = document.getElementById('userErrorMsg');
    errorMsg.textContent = '';
    const username = document.getElementById('newUsernameInput').value.trim();
    const password = document.getElementById('newPasswordInput').value;
    try {
      await api('/api/auth/users', { method: 'POST', body: JSON.stringify({ username, password }) });
      document.getElementById('newUsernameInput').value = '';
      document.getElementById('newPasswordInput').value = '';
      await refreshUsersList();
    } catch (e) {
      errorMsg.textContent = e.message;
    }
  });
}

function setupChartTabs() {
  document.querySelectorAll('.chart-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const customBar = document.getElementById('customRangeBar');
      if (tab.dataset.range === 'custom') {
        customBar.style.display = 'flex';
        const startEl = document.getElementById('customStart');
        const endEl = document.getElementById('customEnd');
        if (!startEl.value || !endEl.value) {
          const today = new Date();
          const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
          endEl.value = today.toISOString().slice(0, 10);
          startEl.value = weekAgo.toISOString().slice(0, 10);
        }
        loadChart('custom');
      } else {
        customBar.style.display = 'none';
        loadChart(tab.dataset.range);
      }
    });
  });

  document.getElementById('applyCustomBtn').addEventListener('click', () => loadChart('custom'));
}

async function init() {
  try {
    currentUser = await api('/api/auth/me');
  } catch (e) {
    return;
  }
  document.getElementById('userLabel').textContent = currentUser.username;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
  document.getElementById('stopBtn').addEventListener('click', stopCurrent);

  setupProjectModal();
  setupUsersModal();
  setupChartTabs();

  await loadStatus();
  await loadProjects();
  await loadChart('daily');

  tickWallClock();
  setInterval(tickElapsed, 1000);
  setInterval(tickWallClock, 1000);
  setInterval(loadStatus, 30000);
}

init();
