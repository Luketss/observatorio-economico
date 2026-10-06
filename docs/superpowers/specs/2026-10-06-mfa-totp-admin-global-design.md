# MFA por app autenticador (TOTP), opcional para ADMIN_GLOBAL — Design

**Data:** 2026-10-06
**Status:** design aprovado em chat pelo usuário (06/10/2026); spec aguardando revisão
**Repositório:** `dashboard_prefeituras` (NID). O LEGIS entra como espelho em frente própria.

## Objetivo

Permitir que o ADMIN_GLOBAL proteja a própria conta com um segundo fator por app autenticador
(TOTP, RFC 6238), cadastrado por ele mesmo quando quiser, com códigos de recuperação para
não ficar trancado fora. Quem não cadastra MFA não percebe nenhuma mudança no login.

Sucesso: o ADMIN_GLOBAL abre "Segurança" no menu do usuário, lê um QR no app autenticador,
confirma um código, guarda os códigos de recuperação e, a partir daí, o login pede o código
depois da senha. Um código reutilizado, fora da janela ou de outro usuário é recusado e fica na
auditoria de logins. Nenhum outro papel vê a opção. Sem a chave de cifra configurada no
servidor, o cadastro é recusado com erro claro e o login de todos continua normal.

## Decisões de escopo (fechadas com o usuário)

1. **Quem:** opcional, e só o ADMIN_GLOBAL pode cadastrar. O modelo serve a qualquer papel; o
   gating é por `require_role("ADMIN_GLOBAL")` nas rotas de cadastro.
2. **Método:** TOTP por app autenticador (Google Authenticator, Authy, 1Password…). Código por
   e-mail fica para a frente de e-mail. Sem "lembrar este dispositivo", sem WebAuthn.
3. **Abordagem A, login em duas etapas com token intermediário:** `/auth/login` devolve um
   `mfa_token` curto em vez dos tokens quando o usuário tem MFA ativo; `/auth/mfa/verificar`
   troca `mfa_token` + código pelos tokens normais. Descartado: emitir access/refresh com claim
   `mfa_pendente` e bloquear em `get_current_user` (mexe na dependência central e deixa um
   refresh token válido com quem só acertou a senha).
4. **Recuperação:** 10 códigos de uso único gerados no ativar, mostrados uma vez. Emergência:
   zerar o MFA de um usuário em `/admin/usuarios` (ação auditada); com um único ADMIN_GLOBAL
   na base, o runbook documenta o caminho via banco.

## Contexto encontrado

- `POST /auth/login` (`routers/auth.py`) com `OAuth2PasswordRequestForm`, rate limit
  `5/minute` e `20/hour` (`core/rate_limit.limiter`), delega a `AuthService.authenticate(email,
  password, ip, user_agent)` que grava `LoginAudit` (`email_tentado, sucesso, motivo String(50),
  ip, user_agent`) e devolve `TokenResponse { access_token, refresh_token, token_type }`.
- Tokens em `core/security.py`: `create_access_token(subject, extra_data)` com claim `type:
  "access"`, `create_refresh_token` com `type: "refresh"`, `decode_token`. `get_current_user`
  rejeita qualquer `type` ≠ `access`, então um token `type: "mfa"` nunca abre rota protegida.
- `Usuario` (`models/usuario.py`): `id, nome, email, senha_hash, municipio_id, role_id, ativo,
  last_login`. Sem campos de MFA.
- Já existe `POST /auth/alterar-senha` e o modal `components/AlterarSenhaModal.jsx` no menu do
  usuário: a entrada "Segurança" entra ao lado.
- Auditoria de ações administrativas: `services/audit_service.registrar_acao` (spec de LGPD de
  16/08) — usada para o zerar-MFA pelo admin.
- Dependências: `python-jose`, `passlib[bcrypt]`, `slowapi`. **Não há** `pyotp`, `qrcode` nem
  `cryptography` declarados em `requirements.txt` (o plano confirma se `cryptography` já vem
  transitivamente; se não, declara).

## Arquitetura

```
LoginPage ── POST /auth/login ──▶ AuthService.authenticate
                                    ├─ senha errada ─────────────▶ 401 (LoginAudit sucesso=false)
                                    ├─ sem MFA ativo ────────────▶ TokenResponse (como hoje)
                                    └─ MFA ativo ────────────────▶ { mfa_obrigatorio: true, mfa_token }
LoginPage (2ª etapa) ── POST /auth/mfa/verificar { mfa_token, codigo } ──▶ MfaService.verificar
                                    ├─ TOTP válido (janela ±1, passo > ultimo_passo_usado) ──▶ TokenResponse
                                    ├─ código de recuperação válido (consome) ───────────────▶ TokenResponse
                                    └─ inválido ──▶ 401 (LoginAudit motivo="mfa_invalido"); 5ª falha invalida o mfa_token

MfaModal (ADMIN_GLOBAL) ── POST /auth/mfa/configurar ─▶ segredo cifrado, ativo=false; devolve otpauth_url + segredo + QR SVG
                        ── POST /auth/mfa/ativar { codigo } ─▶ ativo=true; devolve 10 códigos de recuperação (uma vez)
                        ── POST /auth/mfa/desativar { senha_atual, codigo } ─▶ apaga a linha
                        ── GET  /auth/mfa/status ─▶ { ativo, ativado_em, codigos_restantes }
UsuariosAdminPage ── POST /usuarios/{id}/mfa/zerar ─▶ apaga a linha; acao_audit "mfa_zerado"
```

## 1. Modelo e segredo

- Tabela nova **`usuario_mfa`** (modelo `UsuarioMfa`, migração Alembic):
  - `usuario_id` PK/FK `usuarios.id` ON DELETE CASCADE (1:1)
  - `segredo_cifrado: Text` (Fernet do segredo base32)
  - `ativo: Boolean NOT NULL default false`
  - `ativado_em: DateTime(tz) | null`
  - `ultimo_passo_usado: BigInteger | null` (contador TOTP do último código aceito; anti-replay)
  - `codigos_recuperacao: JSON` (lista de hashes bcrypt; código consumido é removido)
  - `criado_em`, `atualizado_em`
  (Sem coluna de tentativas: o limite de 5 falhas é por `mfa_token`, em memória, item 3.)
- `Usuario.mfa = relationship("UsuarioMfa", uselist=False, cascade="all, delete-orphan")`.
- **Cifra em repouso:** `core/mfa_crypto.py` com `cifrar(texto) -> str` / `decifrar(token) -> str`
  usando `cryptography.fernet.Fernet(settings.MFA_ENCRYPTION_KEY)`. Env nova
  `MFA_ENCRYPTION_KEY: str = ""` em `config.py` (chave Fernet, gerada uma vez com
  `Fernet.generate_key()`); vazia → `MfaIndisponivel` (503) nas rotas de cadastro/verificação
  e `authenticate` trata usuários com MFA ativo como se a verificação falhasse (não loga sem o
  2º fator; mensagem clara "MFA indisponível no servidor"). Rotacionar a chave invalida todos
  os segredos: o runbook avisa.
- Dependências novas em `requirements.txt`: `pyotp`, `qrcode` (QR em SVG via
  `qrcode.image.svg.SvgPathImage`, sem Pillow) e `cryptography` se não estiver presente.

## 2. Cadastro (ADMIN_GLOBAL)

Router novo `routers/mfa.py`, prefixo `/auth/mfa`, registrado em `main.py`. Todas as rotas
abaixo com `Depends(require_role("ADMIN_GLOBAL"))` e `@limiter.limit("5/minute")`.

- `POST /auth/mfa/configurar` → gera segredo `pyotp.random_base32()`, upsert em `usuario_mfa`
  com `ativo=false` (reconfigurar antes de ativar sobrescreve; **com MFA já ativo → 409**,
  desative antes). Devolve `{ otpauth_url, segredo, qr_svg }`; `otpauth_url =
  pyotp.TOTP(segredo).provisioning_uri(name=email, issuer_name="UAIZI NID")`.
- `POST /auth/mfa/ativar { codigo }` → exige linha com `ativo=false`; valida TOTP (janela ±1);
  gera 10 códigos `XXXX-XXXX` (alfabeto sem ambíguos, `secrets`), grava hashes bcrypt, marca
  `ativo=true`, `ativado_em=now`, `ultimo_passo_usado=passo do código`. Devolve
  `{ codigos_recuperacao: [10 strings] }` **uma única vez**. Grava `acao_audit` "mfa_ativado".
- `POST /auth/mfa/desativar { senha_atual, codigo }` → exige senha correta **e** TOTP ou código
  de recuperação válido; apaga a linha. Grava `acao_audit` "mfa_desativado".
- `GET /auth/mfa/status` → `{ ativo, ativado_em, codigos_restantes }` (0/0/null quando não há
  linha).
- `POST /usuarios/{id}/mfa/zerar` (em `routers/usuarios.py`, `require_role("ADMIN_GLOBAL")`) →
  apaga a linha do usuário alvo; `acao_audit` "mfa_zerado" com alvo. Não pode zerar a própria
  conta (use desativar).

## 3. Login em duas etapas

- `AuthService.authenticate` (hoje devolve um dict `{ access_token, refresh_token, token_type }`)
  após validar a senha: se `usuario.mfa and usuario.mfa.ativo`, **não grava `LoginAudit` nem
  atualiza `last_login` nesse ponto**; devolve `{ mfa_obrigatorio: true, mfa_token }`
  (`MfaPendenteResponse`), onde `mfa_token = create_mfa_token(subject=user.id)`
  (`core/security.py` novo: `type: "mfa"`, `exp` 5 min, `jti` aleatório). A auditoria e o
  `last_login` acontecem só no 2º fator.
- `POST /auth/mfa/verificar { mfa_token, codigo }` (sem auth header; `@limiter.limit("10/minute")`):
  1. `decode_token`; `type` ≠ `mfa` ou expirado → 401.
  2. Contador de falhas por `jti` em memória com TTL 5 min (dict no processo; com worker
     separado isso vale por processo, aceito) — 5 falhas → 401 "token invalidado, faça login
     de novo".
  3. Código de 6 dígitos → `pyotp.TOTP(segredo).verify(codigo, valid_window=1)` **e** passo
     (`int(time()/30)` do código aceito) `> ultimo_passo_usado`; aceito → atualiza
     `ultimo_passo_usado`.
  4. Código `XXXX-XXXX` → compara bcrypt contra `codigos_recuperacao`; aceito → remove o hash.
  5. Sucesso → `LoginAudit(sucesso=true, motivo="mfa_ok")`, `last_login=now`, devolve
     `TokenResponse`. Falha → `LoginAudit(sucesso=false, motivo="mfa_invalido")`, 401 genérico.
- O `mfa_token` nunca é aceito por `get_current_user` (já rejeita `type` ≠ `access`); teste
  garante.

## 4. Frontend

- `AuthContext.login(email, senha)` passa a devolver `{ mfa: true, mfaToken }` quando a resposta
  tem `mfa_obrigatorio`, senão segue como hoje (guarda token, carrega `/auth/me`). Novo
  `verificarMfa(mfaToken, codigo)` → `POST /auth/mfa/verificar`, guarda tokens, carrega `/auth/me`.
- `LoginPage`: estado `etapa: "senha" | "codigo"`. Na etapa `codigo`: campo numérico de 6
  dígitos com `inputMode="numeric"`, `autoComplete="one-time-code"`, autofoco; link "Usar código
  de recuperação" alterna para campo de texto `XXXX-XXXX`; erro inline "Código inválido"; botão
  "Voltar" retorna à senha; 401 de token invalidado volta à etapa senha com aviso.
- Menu do usuário em `app/layouts/DashboardLayout.jsx` (onde já está "Alterar senha" abrindo
  `AlterarSenhaModal`): item **"Segurança"** visível só para
  `user.role === "ADMIN_GLOBAL"`, abre `components/MfaModal.jsx`:
  - Estado atual via `GET /auth/mfa/status`.
  - Inativo → botão "Ativar": passo 1 QR (SVG inline) + segredo em texto com botão copiar;
    passo 2 campo de código → `ativar`; passo 3 lista dos 10 códigos de recuperação com
    "Copiar todos" e aviso "guarde agora, não aparecem de novo"; botão "Concluir" só habilita
    após copiar ou marcar "já guardei".
  - Ativo → `ativado_em`, `codigos_restantes`, botão "Desativar" (senha + código).
  - Erros: 503 "MFA indisponível no servidor", 409, 401 inline.
- `UsuariosAdminPage`: coluna/ícone "MFA" (ativo ou não; vem de `GET /usuarios` com campo novo
  `mfa_ativo: bool`) e ação "Zerar MFA" com confirmação, só em usuários que não sejam o próprio.

## 5. Tratamento de erros

| Situação | Comportamento |
|---|---|
| `MFA_ENCRYPTION_KEY` vazia | Rotas de cadastro/verificação → 503; login sem MFA normal; usuário com MFA ativo não consegue passar do 2º fator (mensagem clara). |
| Código reutilizado (replay) | 401 `mfa_invalido`, mesmo dentro da janela. |
| Relógio do celular adiantado/atrasado 30 s | Aceito pela janela ±1. |
| 5 falhas no mesmo `mfa_token` | 401 "faça login de novo"; front volta à etapa senha. |
| `mfa_token` usado em rota protegida | 401 por `type` ≠ `access`. |
| Configurar com MFA já ativo | 409. |
| Desativar sem senha ou sem código válido | 401; nada muda. |
| Admin tenta zerar a própria conta | 400 "use desativar". |
| Perdeu app e códigos, único ADMIN_GLOBAL | Runbook: `DELETE FROM usuario_mfa WHERE usuario_id=…` via Railway. |

## 6. Testes

**Backend** (pytest, fixture com `MFA_ENCRYPTION_KEY` de teste):
- Cadastro: configurar devolve otpauth/segredo/QR SVG; ativar com código gerado por `pyotp`
  no teste → 10 códigos no formato, hashes gravados, `ativo=true`; ativar com código errado →
  401 e `ativo=false`; configurar com ativo → 409; desativar exige senha e código.
- Login: usuário sem MFA → `TokenResponse` (regressão); com MFA → `mfa_obrigatorio` e
  `mfa_token` com `type=mfa`; `verificar` com TOTP → tokens e `LoginAudit mfa_ok`; mesmo código
  de novo → 401 (replay); código do passo anterior (janela) aceito uma vez; código de
  recuperação → tokens e hash removido; segunda vez → 401; 5 falhas → token invalidado;
  `mfa_token` em `/auth/me` → 401; `mfa_token` expirado → 401.
- RBAC: ADMIN_MUNICIPIO → 403 em todas as rotas de cadastro; `zerar` por ADMIN_GLOBAL apaga a
  linha e grava `acao_audit`; zerar a si mesmo → 400.
- Sem chave: cadastro → 503; login sem MFA → 200.
- Cifra: `cifrar/decifrar` round-trip; valor no banco não contém o segredo base32.

**Frontend** (vitest + jsdom):
- `LoginPage.test.jsx`: resposta `mfa_obrigatorio` mostra a etapa de código; código válido
  navega; 401 mostra erro inline; link alterna para código de recuperação; "Voltar" limpa.
- `MfaModal.test.jsx` (API mockada): três passos; "Concluir" bloqueado até copiar/marcar;
  estado ativo mostra desativar; 503 e 409 renderizados.
- `AuthContext.test.jsx`: `login` devolve `{ mfa: true }` sem gravar token; `verificarMfa`
  grava token e carrega `/auth/me`.
- Menu: "Segurança" só para ADMIN_GLOBAL.

Gates: `venv/Scripts/python -m pytest backend/tests -q` e `npx vitest run` verdes; lint sem
erro novo.

## 7. Documentação e operação

- `README.md` e `AGENTS.md` §14: env `MFA_ENCRYPTION_KEY` (gerar com
  `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`),
  nunca rotacionar sem zerar os MFAs.
- `docs/lgpd.md` §2 (inventário, conta de usuário): acrescentar "segredo TOTP cifrado e hashes
  de códigos de recuperação, quando o usuário ativa MFA"; §5 (segurança): "segundo fator TOTP
  opcional para administradores da plataforma".
- Runbook curto `docs/mfa.md`: ativar, perder acesso, zerar via admin ou via banco, rotação da
  chave.

## 8. Ordem de entrega

1. Backend: deps + config + `mfa_crypto` + modelo/migração + `MfaService` + rotas de cadastro +
   testes.
2. Backend: `authenticate` em duas etapas + `verificar` + auditoria + testes.
3. Frontend: `AuthContext` + `LoginPage` + testes.
4. Frontend: `MfaModal` + menu + `UsuariosAdminPage` (status e zerar) + testes.
5. Docs (README, AGENTS, LGPD, `docs/mfa.md`); env na Railway; verificação manual com um app
   autenticador.

## Fora de escopo (anotado, não silencioso)

- MFA para ADMIN_MUNICIPIO/VISUALIZADOR (gating only; modelo pronto)
- Código por e-mail como 2º fator (frente de e-mail)
- "Lembrar este dispositivo", WebAuthn/passkeys, SMS
- Forçar MFA por política (obrigatório)
- Contador de falhas compartilhado entre processos (Redis)
- Espelho no LEGIS

## Riscos e notas

- **Chave de cifra**: perder `MFA_ENCRYPTION_KEY` = todos os MFAs inválidos; o caminho de
  recuperação é zerar via banco e recadastrar. Documentado no runbook.
- **Contador de falhas em memória**: com mais de um processo/réplica, cada um conta separado
  (até 5×N tentativas por token de 5 min). Aceito pelo volume; Redis fica para depois.
- **`last_login` só após o 2º fator**: a tela de auditoria passa a mostrar `mfa_ok` como o
  login efetivo de quem tem MFA; `motivo` continua `String(50)`.
