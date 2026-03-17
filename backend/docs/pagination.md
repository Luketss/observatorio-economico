# 📄 Paginação

O backend utiliza paginação padrão enterprise.

---

## 🔢 Query Params

```
?skip=0&limit=20
```

- `skip` → Quantidade de registros ignorados
- `limit` → Quantidade máxima retornada

---

## 📦 Estrutura de Resposta

```
{
  "success": true,
  "items": [...],
  "total": 250,
  "skip": 0,
  "limit": 20
}
```

---

## ✅ Vantagens

- Escalabilidade
- Performance
- Suporte a tabelas grandes
- Integração facilitada com frontend

---

## 🔮 Evolução Futura

- Ordenação dinâmica
- Filtros avançados
- Paginação baseada em cursor
