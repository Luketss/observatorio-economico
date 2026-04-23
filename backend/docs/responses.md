# Padrões de Resposta

O backend retorna Pydantic models diretamente via `response_model` do FastAPI — sem envelope `SuccessResponse`. Os erros seguem o padrão HTTPException do FastAPI.

---

## Resposta de dados simples

Endpoint com `response_model=Schema`:

```json
{
  "ano": 2024,
  "mes": 3,
  "valor_total": 1250000.0
}
```

---

## Resposta de lista

Endpoint com `response_model=List[Schema]`:

```json
[
  { "ano": 2024, "mes": 1, "valor_total": 980000.0 },
  { "ano": 2024, "mes": 2, "valor_total": 1100000.0 }
]
```

---

## Paginação (apenas /usuarios)

```json
{
  "items": [ { "id": 1, "nome": "João", "email": "joao@..." } ],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

---

## Erros

FastAPI retorna erros no formato:

```json
{
  "detail": "Mensagem de erro descritiva"
}
```

Erros comuns:

| Status | Situação |
|--------|---------|
| 401 | Token inválido ou ausente |
| 403 | Permissão insuficiente (role ou plano) |
| 404 | Recurso não encontrado |
| 422 | Dados de entrada inválidos (Pydantic) |
| 500 | Erro interno — verifique logs |

> **Nota sobre CORS:** Quando o backend retorna 500, o browser reporta erro de CORS porque as CORS headers não são incluídas em respostas de erro não tratadas. Sempre verifique os logs do servidor antes de diagnosticar como problema de CORS.

---

## Endpoints de comparativo

Os endpoints `/comparativo/*` e `/pib/ranking` retornam listas com:

```json
[
  {
    "municipio_id": 3,
    "municipio": "Divinópolis",
    "estado": "MG",
    "total": 15800000.0
  }
]
```

Suportam filtro opcional `?estado=MG`.
