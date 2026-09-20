const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setAuthCookie, clearAuthCookie, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'usuario e senha sao obrigatorios' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'usuario ou senha invalidos' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'usuario ou senha invalidos' });

  setAuthCookie(res, user);
  res.json({ id: user.id, username: user.username });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

// Qualquer usuario logado pode cadastrar outro (multiusuario simples, sem hierarquia)
router.post('/users', requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'usuario e senha sao obrigatorios' });
  if (password.length < 4) return res.status(400).json({ error: 'senha muito curta (minimo 4 caracteres)' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'usuario ja existe' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  res.status(201).json({ id: info.lastInsertRowid, username });
});

router.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY username').all();
  res.json(users);
});

module.exports = router;
