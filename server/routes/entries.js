const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Lista os lancamentos do usuario, mais recentes primeiro, paginado.
router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const rows = db
    .prepare(
      `SELECT te.id, te.start_time, te.end_time, te.note,
              p.id AS project_id, p.name AS project_name, p.color AS project_color, p.icon AS project_icon
       FROM time_entries te JOIN projects p ON p.id = te.project_id
       WHERE te.user_id = ?
       ORDER BY te.start_time DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.user.id, limit + 1, offset);

  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((r) => ({
    id: r.id,
    start_time: r.start_time,
    end_time: r.end_time,
    note: r.note || '',
    project: { id: r.project_id, name: r.project_name, color: r.project_color, icon: r.project_icon },
  }));

  res.json({ entries, hasMore });
});

// Atualiza a nota de um lancamento (so o dono do lancamento pode editar).
router.patch('/:id/note', requireAuth, (req, res) => {
  const { note } = req.body || {};
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'lancamento nao encontrado' });

  const trimmed = (note || '').toString().slice(0, 500);
  db.prepare('UPDATE time_entries SET note = ? WHERE id = ?').run(trimmed, entry.id);
  res.json({ id: entry.id, note: trimmed });
});

module.exports = router;
