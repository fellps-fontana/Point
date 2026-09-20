require('./db'); // garante criacao das tabelas e seed do admin antes de subir o servidor

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const clockRoutes = require('./routes/clock');
const reportRoutes = require('./routes/reports');
const { requireAuth } = require('./auth');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/clock', clockRoutes);
app.use('/api/reports', reportRoutes);

// bloqueia acesso direto ao index.html sem estar logado (checagem real e feita
// pelo frontend via /api/auth/me, isso aqui e so pra nao servir a pagina cheia
// pra quem nunca logou nesse navegador)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Ponto app rodando na porta ${PORT}`);
});
