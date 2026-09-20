const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const VALID_ICONS = [
  'briefcase', 'book', 'code', 'palette', 'phone',
  'home', 'receipt', 'wrench', 'coffee', 'star', 'folder',
];

function safeIcon(icon) {
  return VALID_ICONS.includes(icon) ? icon : 'briefcase';
}

router.get('/', requireAuth, (req, res) => {
  const onlyActive = req.query.all !== '1';
  const projects = onlyActive
    ? db.prepare('SELECT * FROM projects WHERE active = 1 ORDER BY name').all()
    : db.prepare('SELECT * FROM projects ORDER BY name').all();
  res.json(projects);
});

router.post('/', requireAuth, (req, res) => {
  const { name, color, icon } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'nome do projeto e obrigatorio' });

  const info = db
    .prepare('INSERT INTO projects (name, color, icon) VALUES (?, ?, ?)')
    .run(name.trim(), color || '#6366f1', safeIcon(icon));
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(project);
});

router.patch('/:id', requireAuth, (req, res) => {
  const { active, name, color, icon } = req.body || {};
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'projeto nao encontrado' });

  db.prepare('UPDATE projects SET active = ?, name = ?, color = ?, icon = ? WHERE id = ?').run(
    active === undefined ? project.active : (active ? 1 : 0),
    name === undefined ? project.name : name.trim(),
    color === undefined ? project.color : color,
    icon === undefined ? project.icon : safeIcon(icon),
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

module.exports = router;
