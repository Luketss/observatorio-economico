# 🤝 Contribuição

Este projeto segue padrões rígidos para manter qualidade e escalabilidade.

---

## ✅ Regras Obrigatórias

- Controllers não podem conter regra de negócio
- Services concentram validações e lógica
- Repository contém apenas queries
- Nunca usar HTTPException diretamente
- Sempre usar SuccessResponse ou PaginatedResponse

---

## 🧱 Fluxo para Nova Feature

1. Model
2. Schema
3. Repository
4. Service
5. Router
6. Registro no main.py
7. Atualização da documentação

---

## 📌 Padrões de Commit

```
feat:
fix:
refactor:
docs:
```

---

## 🧪 Testes

Recomendado:

- Testes de Service
- Testes de integração
- Testes de autenticação

---

## 📚 Atualização da Documentação

Toda nova feature relevante deve atualizar:

- CHANGELOG
- Roadmap (se aplicável)
- Documentação técnica
