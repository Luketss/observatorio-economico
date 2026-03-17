# 📦 Padrões de Resposta

O backend utiliza um padrão consistente para todas as respostas.

---

## ✅ SuccessResponse

Formato:

```
{
  "success": true,
  "data": { ... }
}
```

Usado para respostas simples.

---

## 📄 PaginatedResponse

Formato:

```
{
  "success": true,
  "items": [...],
  "total": 100,
  "skip": 0,
  "limit": 20
}
```

Usado para listagens.

---

## ❌ Erros

Formato padrão:

```
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem descritiva"
  }
}
```

---

## 📌 Benefícios

- Contrato previsível
- Integração simples com frontend
- Documentação clara
- Evolução controlada
