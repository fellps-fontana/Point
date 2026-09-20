const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function getOpenEntry(userId) {
  return db
    .prepare(
      `SELECT te.*, p.name AS project_name, p.color AS project_color, p.icon AS project_icon
       FROM time_entries te JOIN projects p ON p.id = te.project_id
       WHERE te.user_id = ? AND te.end_time IS NULL`
    )
    .get(userId);
}

router.get('/status', requireAuth, (req, res) => {
  const open = getOpenEntry(req.user.id);
  res.json({ open: open || null });
});

// Regra de negocio:
// - Sem ponto aberto -> abre ponto no projeto clicado.
// - Ponto aberto em OUTRO projeto -> fecha o anterior (end_time = agora) e abre o novo.
// - Ponto aberto no MESMO projeto -> ignora, nao faz nada (retorna o ponto ja aberto).
router.post('/:projectId', requireAuth, (req, res) => {
  const projectId = Number(req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND active = 1').get(projectId);
  if (!project) return res.status(404).json({ error: 'projeto nao encontrado ou inativo' });

  const open = getOpenEntry(req.user.id);
  const nowIso = new Date().toISOString();

  if (open && open.project_id === projectId) {
    return res.json({ action: 'ignored', open });
  }

  if (open) {
    db.prepare('UPDATE time_entries SET end_time = ? WHERE id = ?').run(nowIso, open.id);
  }

  const info = db
    .prepare('INSERT INTO time_entries (user_id, project_id, start_time) VALUES (?, ?, ?)')
    .run(req.user.id, projectId, nowIso);

  const newOpen = getOpenEntry(req.user.id);
  res.json({ action: 'started', closedPrevious: !!open, open: newOpen, entryId: info.lastInsertRowid });
});

// Encerrar o ponto atual sem abrir outro (opcional, ex: "parar de trabalhar")
router.post('/stop/current', requireAuth, (req, res) => {
  const open = getOpenEntry(req.user.id);
  if (!open) return res.json({ action: 'noop' });
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE time_entries SET end_time = ? WHERE id = ?').run(nowIso, open.id);
  res.json({ action: 'stopped' });
});

module.exports = router;
