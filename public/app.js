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
  const noteBox = document.getElementById('noteBox');

  if (currentStatus && currentStatus.open) {
    const open = currentStatus.open;
    timerEl.textContent = fmtElapsed(open.start_time);
    timerEl.className = 'elapsed-timer is-running';
    timerEl.style.color = open.project_color;
    labelEl.innerHTML = `<span class="status-dot" style="background:${open.project_color}"></span> ${escapeHtml(open.project_name)}`;
    stopBtn.style.display = 'inline-block';
    noteBox.style.display = 'block';
    renderNoteBox(open);
  } else {
    timerEl.textContent = '00:00:00';
    timerEl.className = 'elapsed-timer is-idle';
    timerEl.style.color = '';
    labelEl.textContent = 'Nenhum ponto ativo';
    stopBtn.style.display = 'none';
    noteBox.style.display = 'none';
    noteBox.innerHTML = '';
  }
}

function renderNoteBox(open) {
  const noteBox = document.getElementById('noteBox');
  if (open.note) {
    noteBox.innerHTML = `<span class="note-text">"${escapeHtml(open.note)}"</span> <a class="note-link" id="editNoteLink">editar</a>`;
  } else {
    noteBox.innerHTML = `<a class="note-link" id="editNoteLink">+ adicionar nota</a>`;
  }
  document.getElementById('editNoteLink').addEventListener('click', () => startNoteEdit(open.id, open.note || ''));
}

function startNoteEdit(entryId, currentNote) {
  const noteBox = document.getElementById('noteBox');
  noteBox.innerHTML = `
    <div class="note-edit-row">
      <input type="text" id="noteInput" maxlength="500" placeholder="o que voce esta fazendo?" value="${escapeHtml(currentNote)}" />
      <button class="btn-primary btn-small" id="saveNoteBtn">Salvar</button>
    </div>
  `;
  const input = document.getElementById('noteInput');
  input.focus();
  const save = async () => {
    const note = input.value.trim();
    await api(`/api/entries/${entryId}/note`, { method: 'PATCH', body: JSON.stringify({ note }) });
    if (currentStatus && currentStatus.open) currentStatus.open.note = note;
    renderNoteBox(currentStatus.open);
  };
  document.getElementById('saveNoteBtn').addEventListener('click', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
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

function renderPieInto(area, bucket, projects, centerLabel, emptyMsg) {
  const rows = bucket.values
    .filter((v) => projects.some((p) => p.id === v.projectId) && v.hours > 0)
    .map((v) => ({ ...v, project: projects.find((p) => p.id === v.projectId) }))
    .sort((a, b) => b.hours - a.hours);

  const total = rows.reduce((sum, r) => sum + r.hours, 0);

  if (rows.length === 0 || total === 0) {
    area.innerHTML = `<div class="empty-state">${escapeHtml(emptyMsg)}</div>`;
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
          <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(centerLabel)}</div>
        </div>
      </div>
      <div class="pie-breakdown">${breakdown}</div>
    </div>
  `;
}

function renderPie(data) {
  const area = document.getElementById('chartArea');
  const projects = visibleProjects(data.projects);
  renderPieInto(area, data.buckets[0], projects, 'hoje', 'Nenhuma hora registrada hoje ainda.');
}

function openBucketPie(bucket, projects, rangeLabel) {
  document.getElementById('bucketPieTitle').textContent = `Detalhe - ${bucket.label}`;
  const area = document.getElementById('bucketPieArea');
  renderPieInto(area, bucket, projects, rangeLabel, 'Sem horas registradas nesse periodo.');
  document.getElementById('bucketPieModal').style.display = 'flex';
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

  const clickable = data.range === 'weekly' || data.range === 'monthly';

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px; display:block; margin:0 auto;">`;

  buckets.forEach((bucket, i) => {
    const x = gap + i * (barWidth + gap);
    let yCursor = height - bottomPad;
    const values = bucket.values.filter((v) => projects.some((p) => p.id === v.projectId));
    const total = values.reduce((sum, v) => sum + v.hours, 0);

    svg += `<g data-bucket-index="${i}"${clickable && total > 0 ? ' class="bucket-clickable" style="cursor:pointer"' : ''}>`;
    // faixa invisivel de clique cobrindo a coluna inteira (mais facil de acertar que so a barra)
    if (clickable && total > 0) {
      svg += `<rect x="${x - gap / 2}" y="0" width="${barWidth + gap}" height="${height}" fill="transparent"/>`;
    }

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
    svg += `</g>`;
  });

  svg += `</svg>`;
  area.innerHTML = svg;

  if (clickable) {
    area.querySelectorAll('.bucket-clickable').forEach((g) => {
      const idx = Number(g.dataset.bucketIndex);
      g.addEventListener('click', () => {
        const rangeLabel = data.range === 'weekly' ? 'na semana' : 'no mes';
        openBucketPie(buckets[idx], projects, rangeLabel);
      });
    });
  }
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

// ---------- Historico ----------

let historyOffset = 0;
const HISTORY_PAGE_SIZE = 20;

function fmtDateTime(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtTimeOnly(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function entryDurationHours(entry) {
  const end = entry.end_time ? new Date(entry.end_time) : new Date();
  const start = new Date(entry.start_time);
  return (end - start) / 1000 / 3600;
}

// Brasilia e UTC-3 fixo (sem horario de verao), entao a conversao e uma soma/subtracao simples,
// independente do fuso do navegador de quem estiver acessando.
function isoToBrtInputValue(iso) {
  const brt = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 16);
}

function brtInputValueToIso(value) {
  const asUtc = new Date(value + ':00.000Z');
  return new Date(asUtc.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

function renderHistoryRow(entry) {
  const row = document.createElement('div');
  row.className = 'history-row';

  function renderView() {
    const isOpen = !entry.end_time;
    const timeRange = isOpen
      ? `${fmtDateTime(entry.start_time)} - em andamento`
      : `${fmtDateTime(entry.start_time)} - ${fmtTimeOnly(entry.end_time)}`;

    row.innerHTML = `
      <span class="pie-icon" style="background:${entry.project.color}22; color:${entry.project.color}">${iconSvg(entry.project.icon, 15)}</span>
      <div class="history-main">
        <div class="history-top">
          <span class="history-project" style="color:${entry.project.color}">${escapeHtml(entry.project.name)}</span>
          <span class="history-duration">${fmtHoursExact(entryDurationHours(entry))}</span>
        </div>
        <div class="history-time">${timeRange}</div>
        <div class="history-note" data-note-area></div>
        <div class="history-actions">
          <a class="note-link" data-edit>Editar</a>
          <a class="note-link history-delete" data-delete>Excluir</a>
        </div>
      </div>
    `;

    const noteArea = row.querySelector('[data-note-area]');
    if (entry.note) {
      noteArea.innerHTML = `<span class="note-text">"${escapeHtml(entry.note)}"</span>`;
    } else {
      noteArea.innerHTML = '';
    }

    row.querySelector('[data-edit]').addEventListener('click', renderEdit);
    row.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!confirm(`Excluir esse lancamento de ${entry.project.name}?`)) return;
      await api(`/api/entries/${entry.id}`, { method: 'DELETE' });
      row.remove();
      loadStatus();
      loadChart(currentRange, { keepRange: true });
    });
  }

  function renderEdit() {
    const isOpen = !entry.end_time;
    const projectOptions = projectsCache
      .map((p) => `<option value="${p.id}" ${p.id === entry.project.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
      .join('');

    row.innerHTML = `
      <div class="history-main" style="width:100%">
        <div class="form-group" style="margin-bottom:8px">
          <label>Projeto</label>
          <select data-field="project">${projectOptions}</select>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <div class="form-group" style="margin-bottom:8px; flex:1; min-width:160px;">
            <label>Inicio</label>
            <input type="datetime-local" data-field="start" value="${isoToBrtInputValue(entry.start_time)}" />
          </div>
          <div class="form-group" style="margin-bottom:8px; flex:1; min-width:160px;">
            <label>Fim</label>
            ${isOpen
              ? '<div style="color:var(--text-dim); font-size:13px; padding-top:8px;">em andamento</div>'
              : `<input type="datetime-local" data-field="end" value="${isoToBrtInputValue(entry.end_time)}" />`}
          </div>
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label>Nota</label>
          <input type="text" data-field="note" maxlength="500" value="${escapeHtml(entry.note || '')}" />
        </div>
        <div class="error-msg" data-error></div>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary btn-small" data-save>Salvar</button>
          <button class="btn-secondary btn-small" data-cancel>Cancelar</button>
        </div>
      </div>
    `;

    row.querySelector('[data-cancel]').addEventListener('click', renderView);
    row.querySelector('[data-save]').addEventListener('click', async () => {
      const errorEl = row.querySelector('[data-error]');
      errorEl.textContent = '';
      const projectId = Number(row.querySelector('[data-field="project"]').value);
      const startVal = row.querySelector('[data-field="start"]').value;
      const endInput = row.querySelector('[data-field="end"]');
      const note = row.querySelector('[data-field="note"]').value.trim();

      const payload = {
        project_id: projectId,
        start_time: brtInputValueToIso(startVal),
        note,
      };
      if (endInput) payload.end_time = brtInputValueToIso(endInput.value);

      try {
        const updated = await api(`/api/entries/${entry.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        Object.assign(entry, updated);
        renderView();
        loadStatus();
        loadChart(currentRange, { keepRange: true });
      } catch (e) {
        errorEl.textContent = e.message;
      }
    });
  }

  renderView();
  return row;
}

async function loadHistory(reset) {
  if (reset) {
    historyOffset = 0;
    document.getElementById('historyList').innerHTML = '';
  }
  const data = await api(`/api/entries?limit=${HISTORY_PAGE_SIZE}&offset=${historyOffset}`);
  const list = document.getElementById('historyList');
  for (const entry of data.entries) {
    list.appendChild(renderHistoryRow(entry));
  }
  historyOffset += data.entries.length;
  document.getElementById('loadMoreBtn').style.display = data.hasMore ? 'inline-block' : 'none';

  if (historyOffset === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum lancamento ainda.</div>';
  }
}

function setupHistoryModal() {
  const modal = document.getElementById('historyModal');
  document.getElementById('historyBtn').addEventListener('click', async () => {
    modal.style.display = 'flex';
    await loadHistory(true);
  });
  document.getElementById('closeHistoryBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('loadMoreBtn').addEventListener('click', () => loadHistory(false));
}

function setupBucketPieModal() {
  document.getElementById('closeBucketPieBtn').addEventListener('click', () => {
    document.getElementById('bucketPieModal').style.display = 'none';
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
  setupHistoryModal();
  setupBucketPieModal();
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
