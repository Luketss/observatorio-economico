# 🛠️ Manutenção

## ✅ Regras Fundamentais

- Controllers devem ser finos
- Services contêm regra de negócio
- Repository contém queries
- Nunca usar HTTPException diretamente
- Sempre usar SuccessResponse ou PaginatedResponse

---

## 🔄 Como adicionar nova funcionalidade

1. Criar Model
2. Criar Schema
3. Criar Repository
4. Criar Service
5. Criar Router
6. Registrar no main.py
7. Atualizar documentação

---

## 📌 Checklist de Código

Antes de merge:

- Código segue Clean Architecture?
- Não há lógica no controller?
- Não há query fora do repository?
- Testado manualmente?

---

## 🧹 Refatoração

Refatorações devem:

- Melhorar legibilidade
- Não quebrar contrato da API
- Manter compatibilidade com frontend

---

## 🔐 Segurança

Sempre validar:

- Permissões via require_role
- Token via get_current_user
- Dados de entrada via Pydantic
