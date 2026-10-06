# Verificação em duas etapas (MFA TOTP) — runbook

Opcional. Só o ADMIN_GLOBAL cadastra, na própria conta, em **Segurança** (ícone de escudo ao
lado de "Alterar senha"). Spec: `docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md`.

## 1. Habilitar no servidor (uma vez)

1. Gerar a chave: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
2. Railway → serviço `api` → Variables → `MFA_ENCRYPTION_KEY=<chave>` → redeploy.
3. Sem a variável, as rotas `/auth/mfa/*` respondem 503 "MFA indisponível" e o login normal segue
   (usuários SEM MFA). Usuários **com** MFA ativo não conseguem concluir o login até a chave ser restaurada.
4. **Nunca rotacionar a chave** com MFAs cadastrados: todos os segredos ficam ilegíveis e cada
   usuário precisa ser zerado e recadastrado (§3). A rotação invalida os códigos TOTP, mas os
   códigos de recuperação (hash bcrypt) continuam valendo: quem tem um deles ainda entra e pode
   rodar "Desativar" (senha + código de recuperação) para se autorrecuperar.

## 2. Cadastrar

1. Menu do usuário → Segurança → "Ativar verificação em duas etapas".
2. Ler o QR no app (Google Authenticator, Authy, 1Password…) ou digitar o segredo.
3. Digitar o código de 6 dígitos → Confirmar.
4. Copiar/guardar os **10 códigos de recuperação** (`XXXX-XXXX`, uso único, não aparecem de novo).
5. Próximos logins: senha → código. Janela de ±30 s; cada código vale uma vez.

## 3. Perdeu o app ou os códigos

- **Há outro ADMIN_GLOBAL**: Admin → Usuários → ícone de escudo laranja → "Zerar MFA" (auditado em
  `acao_audit` como `mfa_zerado`). O usuário entra só com a senha e recadastra.
- **Único ADMIN_GLOBAL**: no Postgres da Railway (`railway connect Postgres` ou o console):
  `DELETE FROM usuario_mfa WHERE usuario_id = (SELECT id FROM usuarios WHERE email = '<email>');`

## 3.1 Endpoints e limites

| Endpoint | Acesso | Limite |
|---|---|---|
| `GET /auth/mfa/status` | autenticado | 30/min |
| `POST /auth/mfa/configurar`, `/ativar`, `/desativar` | ADMIN_GLOBAL | 5/min |
| `POST /auth/mfa/verificar` | público (exige `mfa_token`) | 10/min |
| `POST /usuarios/{id}/mfa/zerar` | ADMIN_GLOBAL | - |

- `mfa_token`: validade de 5 min e **uso único** (após um login bem-sucedido o mesmo token é recusado).
- 5 falhas no mesmo token o invalidam.
- Migração: `0042_usuario_mfa`.

## 3.2 Códigos de erro de `/auth/mfa/verificar`

| `error.code` | Significado | Comportamento da UI |
|---|---|---|
| `MFA_SESSAO_INVALIDA` | `mfa_token` inválido/expirado ou usuário inapto | volta para a senha com aviso |
| `MFA_TOKEN_INVALIDADO` | 5 falhas ou token já usado | volta para a senha com aviso |
| `UNAUTHORIZED` | código errado | erro inline, mantém a etapa |
| `MFA_INDISPONIVEL` (503) | `MFA_ENCRYPTION_KEY` ausente/inválida | "MFA indisponível no servidor" |
| `MFA_SEGREDO_INVALIDO` | segredo não decifra (chave rotacionada) | mostra a mensagem do backend; zerar e recadastrar |

## 4. Auditoria

- `login_audit.motivo`: `mfa_ok` (login completo com 2º fator), `mfa_invalido` (código errado/replay).
  O `last_login` só atualiza após o 2º fator.
- `acao_audit.acao`: `mfa_ativado`, `mfa_desativado`, `mfa_zerado`.
- 5 códigos errados no mesmo login invalidam a tentativa; o usuário recomeça pela senha.

## 5. Limites conhecidos

- Contador de falhas em memória por processo (com N réplicas, até 5×N tentativas por tentativa de login).
- Só TOTP nesta frente; código por e-mail chega com a frente de e-mail.
