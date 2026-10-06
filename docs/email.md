# E-mail transacional (Resend) — runbook

Usos: "Esqueci minha senha" (qualquer usuário) e código de verificação por e-mail como segundo
fator (ADMIN_GLOBAL que escolher e-mail no lugar do app). Spec:
`docs/superpowers/specs/2026-10-06-email-resend-redefinicao-mfa-design.md`.

## 1. Configurar o Resend (uma vez)

1. Criar a conta em resend.com (plano grátis: 3 mil e-mails/mês).
2. Domains → Add Domain → `uaizi.com.br`.
3. Publicar no DNS de `uaizi.com.br` os registros que o Resend mostrar: SPF (`TXT`), DKIM
   (`TXT`/`CNAME`) e, para começar, DMARC `TXT _dmarc` com `v=DMARC1; p=none`.
4. Esperar o status "Verified". Sem domínio verificado o Resend responde 403 e nada sai.
5. API Keys → Create → permissão **Sending access** (só envio).

## 2. Variáveis no Railway (serviço `api`)

| Variável | Valor |
|---|---|
| `RESEND_API_KEY` | a chave `re_...` do passo 1.5 |
| `EMAIL_REMETENTE` | `UAIZI NID <nao-responda@uaizi.com.br>` (default; só mudar se trocar o domínio) |
| `FRONTEND_URL` | `https://nid.uaizi.com.br` — **obrigatória**: monta o link do e-mail de redefinição |

O serviço `worker` não envia e-mail. Sem `RESEND_API_KEY` a API roda em **modo seco**: nada é
enviado, o corpo do e-mail vai para o log (fora de produção) e os fluxos seguem como se tivessem
enviado — útil em desenvolvimento.

## 3. Testar em produção

1. Em `/login` → "Esqueci minha senha" → informar a própria conta.
2. Conferir a caixa de entrada (e o spam) e o log de envios no painel do Resend.
3. Abrir o link, definir uma senha nova e entrar com ela.

## 4. Regras que valem saber

- Link de redefinição: 30 minutos, uso único; pedir de novo invalida o anterior; até 3 pedidos
  por conta por hora (os seguintes respondem igual, sem enviar). A resposta é sempre a mesma,
  exista ou não a conta.
- Código MFA por e-mail: 6 dígitos, 10 minutos, 5 tentativas; "Reenviar" a cada 60 s, até 3 vezes
  por login. Códigos de recuperação continuam valendo.
- Tokens e códigos ficam no banco só como hash e os tokens de redefinição são apagados 24 h
  depois (`RETENCAO_REDEFINICAO_HORAS`).
- Rotas: `POST /auth/esqueci-senha` (3/min), `GET /auth/redefinir-senha/validar`,
  `POST /auth/redefinir-senha` (5/min), `POST /auth/mfa/reenviar` (3/min),
  `POST /auth/mfa/enviar-codigo` (3/min, ADMIN_GLOBAL). Migrações `0043_redefinicao_senha` e
  `0044_usuario_mfa_email`.

## 5. Problemas comuns

- **Caiu no spam**: confirme SPF e DKIM "Verified"; publique DMARC; evite mudar o remetente.
- **Link aponta para localhost**: `FRONTEND_URL` não foi definida no serviço `api`.
- **Nada chega e o log diz "HTTP 403"**: domínio não verificado ou chave sem permissão de envio.
- **Login por e-mail mostra "Não conseguimos enviar o e-mail"**: o Resend falhou ou demorou mais
  de 10 s; o usuário pode usar "Reenviar código" ou um código de recuperação.
