# 🤝 Contributing Guide – Backend

## 📌 Objetivo

Este documento define padrões obrigatórios para manter a qualidade, organização e escalabilidade do backend.

---

# 1️⃣ Regras Gerais

✅ Controllers devem ser finos  
✅ Toda regra de negócio deve estar em Services  
✅ Toda query deve estar em Repository  
✅ Nunca usar HTTPException diretamente (usar exceções de domínio)  
✅ Sempre usar SuccessResponse ou PaginatedResponse  

---

# 2️⃣ Fluxo para Nova Feature

1. Criar Model (se necessário)
2. Criar Schema (entrada e saída)
3. Criar Repository (ou extender existente)
4. Criar Service
5. Criar Router
6. Registrar no main.py
7. Atualizar documentação

---

# 3️⃣ Convenções

- Nomes em inglês para código
- Mensagens de erro claras
- Funções pequenas e objetivas
- Sem lógica duplicada

---

# 4️⃣ Padrões de Commit

Formato recomendado:

```
feat: adiciona filtro por municipio
fix: corrige validação de token
refactor: melhora estrutura do repository
docs: atualiza guia de arquitetura
```

---

# 5️⃣ Revisão de Código

Antes de merge:

- [ ] Seguiu arquitetura limpa?
- [ ] Não colocou regra no controller?
- [ ] Não fez query direta fora do repository?
- [ ] Testado manualmente?

---

# ✅ Filosofia

Código deve ser previsível, simples e expansível.
