# Verificação em duas etapas (MFA TOTP) — runbook

Opcional. Só o ADMIN_GLOBAL cadastra, na própria conta, em **Segurança** (ícone de escudo ao
lado de "Alterar senha"). Spec: `docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md`.

## 1. Habilitar no servidor (uma vez)

1. Gerar a chave: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
2. Railway → serviço `api` → Variables → `MFA_ENCRYPTION_KEY=<chave>` → redeploy.
3. Sem a variável, as rotas `/auth/mfa/*` respondem 503 "MFA indisponível" e o login normal segue.
4. **Nunca rotacionar a chave** com MFAs cadastrados: todos os segredos ficam ilegíveis e cada
   usuário precisa ser zerado e recadastrado (§3).

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

## 4. Auditoria

- `login_audit.motivo`: `mfa_ok` (login completo com 2º fator), `mfa_invalido` (código errado/replay).
  O `last_login` só atualiza após o 2º fator.
- `acao_audit.acao`: `mfa_ativado`, `mfa_desativado`, `mfa_zerado`.
- 5 códigos errados no mesmo login invalidam a tentativa; o usuário recomeça pela senha.

## 5. Limites conhecidos

- Contador de falhas em memória por processo (com N réplicas, até 5×N tentativas por tentativa de login).
- Só TOTP nesta frente; código por e-mail chega com a frente de e-mail.
