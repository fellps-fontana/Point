# Ponto

App simples de ponto por projeto. Multiusuario, com login, grafico diario/semanal/mensal de horas por projeto.

## Regras implementadas

- Bater ponto num projeto sem ponto aberto: inicia o cronometro nesse projeto.
- Bater ponto num projeto DIFERENTE do que esta rodando: fecha o anterior e inicia o novo.
- Bater ponto no MESMO projeto que ja esta rodando: nao faz nada (ignora o clique).
- Botao "Parar ponto" encerra sem abrir outro.
- Qualquer usuario logado pode cadastrar outro usuario (multiusuario simples, sem hierarquia/permissoes).
- Os graficos (diario / semanal / mensal) mostram horas empilhadas por projeto, calculadas no fuso America/Sao_Paulo.

## Como rodar no notebook (Docker)

1. Copie a pasta `ponto-app` para o notebook (a mesma maquina onde o myfinance ja roda).
2. Dentro da pasta, copie o arquivo de exemplo de variaveis:

   ```
   cp .env.example .env
   ```

3. Abra o `.env` e troque pelo menos:
   - `JWT_SECRET` (qualquer string aleatoria, tipo senha)
   - `ADMIN_PASS` (a senha do usuario admin criado na primeira execucao)
   - `HOST_PORT` se a porta 4001 ja estiver em uso por outra coisa no notebook.

4. Suba o container:

   ```
   docker compose up -d --build
   ```

5. Acesse de qualquer maquina na VPN: `http://<ip-do-notebook>:4001` (ou a porta que voce escolheu em HOST_PORT).

6. Login inicial: usuario `admin`, senha a que voce colocou em `ADMIN_PASS`. Depois de logar, use o botao "Usuarios" pra cadastrar os outros usuarios.

## Dados

Os dados ficam num banco SQLite em `./data/ponto.db`, montado como volume — sobrevive a rebuild do container. Faca backup desse arquivo se quiser.

## Portas

Confirme que a porta escolhida (padrao 4001) nao conflita com o myfinance antes de subir. Como cada servico roda em container Docker separado, so ha conflito se os dois tentarem publicar a MESMA porta no host.

## Estrutura

```
ponto-app/
  server/       -> backend Express + SQLite
  public/       -> frontend (html/css/js puro, sem build step)
  docker-compose.yml
  Dockerfile
  .env.example
```
