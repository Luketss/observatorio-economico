# Paginação

A maioria dos endpoints retorna listas completas (sem paginação) pois os datasets são filtrados por município. A paginação enterprise é usada apenas em `/usuarios`.

---

## Endpoint paginado: /usuarios

```
GET /api/v1/usuarios?skip=0&limit=20
```

| Param | Padrão | Descrição |
|-------|--------|-----------|
| `skip` | 0 | Registros a pular |
| `limit` | 20 | Máximo de registros retornados |

Resposta:

```json
{
  "items": [...],
  "total": 45,
  "skip": 0,
  "limit": 20
}
```

---

## Endpoints sem paginação

Todos os endpoints de datasets (arrecadação, PIB, CAGED, RAIS, etc.) retornam a série completa do município. O volume por município é manejável sem paginação.

---

## Filtros disponíveis nos endpoints de série

| Param | Tipo | Exemplo | Endpoints |
|-------|------|---------|-----------|
| `ano` | int | `?ano=2024` | maioria dos endpoints |
| `estado` | str | `?estado=MG` | todos os `/comparativo/*` |
