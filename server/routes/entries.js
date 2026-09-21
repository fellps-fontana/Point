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

// Edicao completa de um lancamento: projeto, horario de inicio/fim e nota.
// Regras:
// - so o dono do lancamento edita.
// - nao da pra "reabrir" um lancamento ja fechado (end_time nao pode virar null se ja tinha valor) -
//   isso quebraria a regra de "so um ponto aberto por vez".
// - end_time, se enviado, tem que ser depois do start_time.
router.patch('/:id', requireAuth, (req, res) => {
  const { project_id, start_time, end_time, note } = req.body || {};
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'lancamento nao encontrado' });

  let newProjectId = entry.project_id;
  if (project_id !== undefined) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) return res.status(400).json({ error: 'projeto invalido' });
    newProjectId = project.id;
  }

  let newStart = entry.start_time;
  if (start_time !== undefined) {
    const d = new Date(start_time);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'start_time invalido' });
    newStart = d.toISOString();
  }

  let newEnd = entry.end_time;
  if (end_time !== undefined) {
    if (end_time === null) {
      if (entry.end_time !== null) {
        return res.status(400).json({ error: 'nao e possivel reabrir um lancamento ja encerrado' });
      }
      newEnd = null;
    } else {
      const d = new Date(end_time);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'end_time invalido' });
      newEnd = d.toISOString();
    }
  }

  if (newEnd !== null && new Date(newEnd) <= new Date(newStart)) {
    return res.status(400).json({ error: 'o horario final precisa ser depois do inicial' });
  }

  // se estiver fechando um lancamento que era o ponto aberto, so pode existir 1 aberto por vez -
  // como estamos fechando (nao abrindo), nao ha conflito a checar aqui.

  const newNote = note === undefined ? entry.note : (note || '').toString().slice(0, 500);

  db.prepare('UPDATE time_entries SET project_id = ?, start_time = ?, end_time = ?, note = ? WHERE id = ?').run(
    newProjectId,
    newStart,
    newEnd,
    newNote,
    entry.id
  );

  const updated = db
    .prepare(
      `SELECT te.id, te.start_time, te.end_time, te.note,
              p.id AS project_id, p.name AS project_name, p.color AS project_color, p.icon AS project_icon
       FROM time_entries te JOIN projects p ON p.id = te.project_id
       WHERE te.id = ?`
    )
    .get(entry.id);

  res.json({
    id: updated.id,
    start_time: updated.start_time,
    end_time: updated.end_time,
    note: updated.note || '',
    project: { id: updated.project_id, name: updated.project_name, color: updated.project_color, icon: updated.project_icon },
  });
});

// Remove um lancamento (so o dono pode excluir).
router.delete('/:id', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'lancamento nao encontrado' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(entry.id);
  res.json({ ok: true });
});

module.exports = router;
