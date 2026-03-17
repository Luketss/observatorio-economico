# 🔐 Autenticação

O sistema utiliza JWT com dois tipos de token:

- Access Token
- Refresh Token

---

## 🔑 Login

Endpoint:

```
POST /auth/login
```

Resposta:

```
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer"
}
```

---

## 🔄 Refresh Token

```
POST /auth/refresh
```

Body:

```
{
  "refresh_token": "..."
}
```

Retorna novo access_token.

---

## 📌 Uso do Access Token

Enviar no header:

```
Authorization: Bearer {access_token}
```

---

## ⏳ Expiração

- Access Token → curta duração
- Refresh Token → longa duração

---

## 🔒 Segurança

- Token validado via decode_token
- Tipo validado (access / refresh)
- Usuário validado como ativo
- Permissões via require_role
