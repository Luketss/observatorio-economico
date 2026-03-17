# 📘 Backend – Architecture & Maintenance Guide  
Observatório Econômico API  

---

# 1️⃣ Visão Geral do Sistema

Este backend foi projetado seguindo princípios de arquitetura limpa (Clean Architecture) e padrões utilizados em sistemas SaaS enterprise.

Stack principal:

- ✅ FastAPI
- ✅ SQLAlchemy (ORM)
- ✅ Alembic (migrações)
- ✅ JWT (Access + Refresh Token)
- ✅ Repository Pattern
- ✅ Service Layer
- ✅ Middleware de auditoria
- ✅ Logging estruturado
- ✅ Paginação enterprise
- ✅ RBAC desacoplado

---

# 2️⃣ Estrutura de Pastas

```
backend/
│
├── app/
│   ├── api/              # Camada HTTP (Controllers, Middleware, Response Models)
│   ├── core/             # Config, segurança, logging, exceções
│   ├── db/               # Base ORM, session, repositories
│   ├── models/           # Entidades do banco
│   ├── schemas/          # DTOs / Pydantic
│   ├── services/         # Regras de negócio
│   └── main.py           # Bootstrap da aplicação
│
├── alembic/              # Migrações de banco
├── requirements.txt
└── ARCHITECTURE_AND_MAINTENANCE_GUIDE.md
```

---

# 3️⃣ Arquitetura e Responsabilidades

## 🔹 Controllers (api/v1/routers)

Responsáveis apenas por:

- Receber requisição
- Chamar service
- Formatar resposta

NÃO devem conter:
- Regra de negócio
- Query direta no banco
- Lógica complexa

---

## 🔹 Service Layer (services/)

Responsável por:

- Regras de negócio
- Validações
- Orquestração entre repositories
- Aplicação de regras de domínio

---

## 🔹 Repository Layer (db/repositories)

Responsável por:

- Acesso a dados
- Queries
- Filtros dinâmicos
- Paginação

Nenhuma regra de negócio deve existir aqui.

---

## 🔹 Core

Contém:

- security.py → JWT + hash
- exceptions.py → Exceções de domínio
- logging.py → Logging estruturado
- config.py → Variáveis de ambiente

---

# 4️⃣ Padrões Implementados

✅ Clean Architecture  
✅ Repository Pattern  
✅ Service Layer Pattern  
✅ Thin Controllers  
✅ SuccessResponse Envelope  
✅ PaginatedResponse  
✅ Filtros Dinâmicos  
✅ Middleware de Auditoria  
✅ Correlation ID  
✅ RBAC desacoplado  
✅ Access + Refresh Token  

---

# 5️⃣ Como Executar o Backend

## 📌 Localmente

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Acesse:

```
http://localhost:8000/docs
```

---

## 📌 Usando Docker

```bash
docker-compose up --build
```

---

# 6️⃣ Fluxo de Autenticação

Login:

```
POST /auth/login
```

Retorna:

- access_token
- refresh_token

Refresh:

```
POST /auth/refresh
```

---

# 7️⃣ Decisões Arquiteturais

### 🔹 Por que Repository Pattern?
Separação clara entre domínio e acesso a dados.

### 🔹 Por que Service Layer?
Evita lógica de negócio no controller.

### 🔹 Por que Envelope de Resposta?
Contrato consistente com frontend.

### 🔹 Por que Paginação Enterprise?
Escalabilidade e performance.

### 🔹 Por que Middleware de Auditoria?
Observabilidade e rastreabilidade.

---

# 8️⃣ Como Manter o Código

## ✅ Sempre manter:

- Controllers finos
- Services com regra de negócio
- Repository apenas com queries
- Exceções centralizadas

## ✅ Ao criar nova feature:

1. Criar Model (se necessário)
2. Criar Schema
3. Criar Repository
4. Criar Service
5. Criar Router
6. Registrar no main.py

---

# 9️⃣ Boas Práticas

- Nunca acessar banco diretamente no controller
- Nunca usar HTTPException fora do handler global
- Sempre usar SuccessResponse ou PaginatedResponse
- Sempre validar permissões via require_role()

---

# 🔟 Plano de Evolução

## 🚀 Próximas Implementações

### 1️⃣ Busca textual avançada
- Filtro por nome/email com LIKE

### 2️⃣ Ordenação dinâmica
- order_by via query param

### 3️⃣ Multi-Tenant
- Isolamento por município

### 4️⃣ Cache estratégico
- Redis para endpoints pesados

### 5️⃣ Testes Automatizados
- Pytest
- Testes de Service
- Testes de integração

### 6️⃣ Observabilidade avançada
- Logs JSON
- Integração ELK / Grafana

### 7️⃣ Rate Limiting
- Proteção contra abuso

---

# 1️⃣1️⃣ Segurança

Recomendações futuras:

- HTTPS obrigatório
- Rotação de SECRET_KEY
- Blacklist de refresh tokens
- Expiração curta para access tokens
- CORS por ambiente

---

# 1️⃣2️⃣ Versionamento Futuro

Caso a API cresça:

```
/api/v1/
/api/v2/
```

Separar routers por versão.

---

# 1️⃣3️⃣ Checklist de Produção

Antes de subir para produção:

- [ ] Variáveis de ambiente configuradas
- [ ] SECRET_KEY forte
- [ ] DEBUG desativado
- [ ] CORS configurado corretamente
- [ ] Logging em nível INFO/WARNING
- [ ] Banco migrado via Alembic

---

# 1️⃣4️⃣ Filosofia do Projeto

Este backend foi estruturado para:

- Escalar
- Ser auditável
- Ser previsível
- Facilitar manutenção
- Permitir crescimento sem refatorações grandes

Ele já está em padrão enterprise e preparado para evoluções estruturadas.

---

# ✅ Conclusão

O sistema está:

- Modular
- Organizado
- Escalável
- Auditável
- Seguro
- Preparado para crescer

Este documento deve ser atualizado sempre que:

- Nova camada for adicionada
- Nova decisão arquitetural for tomada
- Novo padrão for adotado

---

**Manter simplicidade estrutural é prioridade.  
Escalar sem perder organização é o objetivo.**
