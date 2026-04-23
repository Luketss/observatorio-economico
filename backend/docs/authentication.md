# Autenticação

O sistema usa JWT com dois tokens: access (curta duração) e refresh (longa duração).

---

## Login

```
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=email@exemplo.com&password=senha
```

Resposta:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

---

## Refresh

```
POST /api/v1/auth/refresh

{ "refresh_token": "eyJ..." }
```

Retorna novo `access_token`.

---

## Uso do token

Enviar no header de todas as requisições protegidas:

```
Authorization: Bearer {access_token}
```

---

## Roles (RBAC)

| Role | Descrição |
|------|-----------|
| `ADMIN_GLOBAL` | Acesso total — todos os dados, todos os municípios, painel admin completo |
| `ADMIN_MUNICIPIO` | Dados do próprio município + gerência de usuários locais |
| `VISUALIZADOR` | Somente leitura dos dados do próprio município |

Verificação de role nos endpoints:

```python
current_user = Depends(get_current_user)
# dentro da função:
if current_user.role.nome != "ADMIN_GLOBAL":
    raise HTTPException(403, "Acesso restrito")
```

---

## Planos

O acesso a módulos e componentes avançados é controlado pelo campo `plano` do `Municipio`:

| Plano | Valor |
|-------|-------|
| Gratuito | `"free"` |
| Pro | `"pro"` |
| Premium | `"premium"` |

A lista de módulos habilitados por plano é configurada na tabela `plano_config` (via `PlanoConfigAdminPage`). O frontend consome `GET /plano-config?plano={plano}` e usa o `PlanContext` + `PlanGate` para bloquear componentes não autorizados.

---

## Segurança

- Senhas armazenadas com hash bcrypt
- Access token com expiração configurável (`ACCESS_TOKEN_EXPIRE_MINUTES`)
- Refresh token com expiração configurável (`REFRESH_TOKEN_EXPIRE_DAYS`)
- `get_current_user` valida token, tipo e usuário ativo a cada request
