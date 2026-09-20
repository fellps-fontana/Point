const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { dayjs, TZ, splitByDay } = require('../time');

const router = express.Router();

function loadDailyTotals(userId, sinceDay, untilDay) {
  // sinceDay/untilDay sao dayjs (TZ) representando o intervalo [inicio do dia, fim do dia] a considerar
  const sinceIso = sinceDay.startOf('day').utc().toISOString();
  const untilIso = untilDay.endOf('day').utc().toISOString();

  const entries = db
    .prepare(
      `SELECT te.start_time, te.end_time, te.project_id, p.name AS project_name, p.color AS project_color, p.icon AS project_icon
       FROM time_entries te JOIN projects p ON p.id = te.project_id
       WHERE te.user_id = ?
         AND te.start_time <= ?
         AND (te.end_time IS NULL OR te.end_time >= ?)`
    )
    .all(userId, untilIso, sinceIso);

  const nowIso = new Date().toISOString();
  // dayKey -> projectId -> { hours, name, color, icon }
  const dayMap = new Map();

  for (const entry of entries) {
    const end = entry.end_time || nowIso;
    const segments = splitByDay(entry.start_time, end);
    for (const seg of segments) {
      if (!dayMap.has(seg.dayKey)) dayMap.set(seg.dayKey, new Map());
      const projMap = dayMap.get(seg.dayKey);
      const cur = projMap.get(entry.project_id) || {
        hours: 0,
        name: entry.project_name,
        color: entry.project_color,
        icon: entry.project_icon,
      };
      cur.hours += seg.hours;
      projMap.set(entry.project_id, cur);
    }
  }

  return dayMap;
}

function projectsSummary(dayMap) {
  const projects = new Map();
  for (const projMap of dayMap.values()) {
    for (const [pid, info] of projMap.entries()) {
      if (!projects.has(pid)) projects.set(pid, { id: pid, name: info.name, color: info.color, icon: info.icon });
    }
  }
  return Array.from(projects.values());
}

function buildTotals(dayMap, projects) {
  const totals = new Map();
  for (const projMap of dayMap.values()) {
    for (const [pid, info] of projMap.entries()) {
      totals.set(pid, (totals.get(pid) || 0) + info.hours);
    }
  }
  return projects.map((p) => ({ projectId: p.id, hours: totals.get(p.id) || 0 }));
}

router.get('/:range', requireAuth, (req, res) => {
  const range = req.params.range;
  let buckets = [];
  let dayMap, projects;

  if (range === 'daily') {
    // "diario" = apenas hoje, granularidade de pizza
    const today = dayjs().tz(TZ).startOf('day');
    dayMap = loadDailyTotals(req.user.id, today, today);
    projects = projectsSummary(dayMap);
    const key = today.format('YYYY-MM-DD');
    const projMap = dayMap.get(key) || new Map();
    buckets = [
      {
        key,
        label: today.format('DD/MM'),
        values: projects.map((p) => ({ projectId: p.id, hours: (projMap.get(p.id) || {}).hours || 0 })),
      },
    ];
  } else if (range === 'weekly') {
    const bucketsToShow = 12;
    const thisWeekStart = dayjs().tz(TZ).startOf('isoWeek');
    const earliestWeekStart = thisWeekStart.subtract(bucketsToShow - 1, 'week');
    dayMap = loadDailyTotals(req.user.id, earliestWeekStart, dayjs().tz(TZ));
    projects = projectsSummary(dayMap);

    for (let i = bucketsToShow - 1; i >= 0; i--) {
      const weekStart = thisWeekStart.subtract(i, 'week');
      const weekEnd = weekStart.add(6, 'day');
      const totals = new Map();
      for (let d = 0; d < 7; d++) {
        const dayKey = weekStart.add(d, 'day').format('YYYY-MM-DD');
        const projMap = dayMap.get(dayKey);
        if (!projMap) continue;
        for (const [pid, info] of projMap.entries()) totals.set(pid, (totals.get(pid) || 0) + info.hours);
      }
      buckets.push({
        key: weekStart.format('YYYY-MM-DD'),
        label: `${weekStart.format('DD/MM')}-${weekEnd.format('DD/MM')}`,
        values: projects.map((p) => ({ projectId: p.id, hours: totals.get(p.id) || 0 })),
      });
    }
  } else if (range === 'monthly') {
    const bucketsToShow = 12;
    const thisMonthStart = dayjs().tz(TZ).startOf('month');
    const earliestMonthStart = thisMonthStart.subtract(bucketsToShow - 1, 'month');
    dayMap = loadDailyTotals(req.user.id, earliestMonthStart, dayjs().tz(TZ));
    projects = projectsSummary(dayMap);

    for (let i = bucketsToShow - 1; i >= 0; i--) {
      const monthStart = thisMonthStart.subtract(i, 'month');
      const monthEnd = monthStart.endOf('month');
      const totals = new Map();
      for (const [dayKey, projMap] of dayMap.entries()) {
        const d = dayjs.tz(dayKey, TZ);
        if (d.isBefore(monthStart) || d.isAfter(monthEnd)) continue;
        for (const [pid, info] of projMap.entries()) totals.set(pid, (totals.get(pid) || 0) + info.hours);
      }
      buckets.push({
        key: monthStart.format('YYYY-MM'),
        label: monthStart.format('MMM/YY'),
        values: projects.map((p) => ({ projectId: p.id, hours: totals.get(p.id) || 0 })),
      });
    }
  } else if (range === 'custom') {
    const startStr = req.query.start;
    const endStr = req.query.end;
    if (!startStr || !endStr) return res.status(400).json({ error: 'informe start e end (YYYY-MM-DD)' });

    let start = dayjs.tz(startStr, TZ).startOf('day');
    let end = dayjs.tz(endStr, TZ).startOf('day');
    if (!start.isValid() || !end.isValid()) return res.status(400).json({ error: 'datas invalidas' });
    if (end.isBefore(start)) [start, end] = [end, start];

    const MAX_DAYS = 366;
    if (end.diff(start, 'day') > MAX_DAYS) return res.status(400).json({ error: `periodo maximo de ${MAX_DAYS} dias` });

    dayMap = loadDailyTotals(req.user.id, start, end);
    projects = projectsSummary(dayMap);

    let cursor = start;
    while (!cursor.isAfter(end)) {
      const key = cursor.format('YYYY-MM-DD');
      const projMap = dayMap.get(key) || new Map();
      buckets.push({
        key,
        label: cursor.format('DD/MM'),
        values: projects.map((p) => ({ projectId: p.id, hours: (projMap.get(p.id) || {}).hours || 0 })),
      });
      cursor = cursor.add(1, 'day');
    }
  } else {
    return res.status(400).json({ error: 'range invalido (use daily, weekly, monthly ou custom)' });
  }

  const totals = buildTotals(dayMap, projects);
  res.json({ range, projects, buckets, totals });
});

module.exports = router;
