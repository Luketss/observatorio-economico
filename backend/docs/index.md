# Observatório Econômico — Backend

Documentação oficial do backend da plataforma de inteligência econômica municipal.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | FastAPI |
| ORM | SQLAlchemy (síncrono) |
| Migrações | Alembic |
| Autenticação | JWT (access + refresh token) |
| Banco | PostgreSQL |
| Validação | Pydantic v2 |

---

## Datasets disponíveis

| Dataset | Tabelas | Endpoints base |
|---------|---------|----------------|
| Arrecadação | `arrecadacao_mensal` | `/arrecadacao` |
| PIB | `pib_anuais` | `/pib` |
| CAGED | 5 tabelas | `/caged` |
| RAIS | 9 tabelas | `/rais` |
| Bolsa Família | `bolsa_familia_resumos` | `/bolsa_familia` |
| Pé-de-Meia | 2 tabelas | `/pe_de_meia` |
| INSS | `inss_anuais` | `/inss` |
| ESTBAN | 2 tabelas | `/estban` |
| Comex | 3 tabelas | `/comex` |
| Empresas (CNPJ) | `empresas` | `/empresas` |
| PIX | `pix_mensais` | `/pix` |

Todos os endpoints de dados filtram automaticamente por `municipio_id` do usuário autenticado, exceto `ADMIN_GLOBAL` que recebe dados de todos os municípios.

---

## Roles

| Role | Acesso |
|------|--------|
| `ADMIN_GLOBAL` | Todos os dados, todos os municípios, painel admin |
| `ADMIN_MUNICIPIO` | Dados do próprio município + gerenciar usuários locais |
| `VISUALIZADOR` | Leitura dos dados do próprio município |

---

## Planos

| Plano | Descrição |
|-------|-----------|
| `free` | Acesso restrito a módulos básicos |
| `pro` | Acesso ampliado |
| `premium` | Acesso total incluindo componentes avançados |

Módulos e componentes por plano são configuráveis via `PlanoConfig` pelo `ADMIN_GLOBAL`.

---

## Módulos adicionais (v1.4)

| Módulo | Tabelas | Endpoints base |
|--------|---------|----------------|
| Projetos | `projeto_eixos`, `projetos` | `/projetos` |
| Indicadores Internos | `indicadores_internos` | `/dados_internos/indicadores` |
| Plano de Governo | `plano_gov_acoes` | `/dados_internos/plano_gov` |
| Eventos do Município | `eventos_municipio` | `/dados_internos/eventos` |

`/projetos/eixos` — ADMIN_GLOBAL somente (criar/editar/excluir eixos estratégicos).  
`/dados_internos/*` — ADMIN_MUNICIPIO escreve, VISUALIZADOR lê; sempre scoped ao `municipio_id`.

---

## Suporte multi-estado

A plataforma suporta municípios de qualquer estado brasileiro. O campo `estado` (UF, 2 chars) é armazenado no modelo `Municipio`. A ingestão recebe `--estado` como argumento CLI. Os endpoints de comparativo aceitam `?estado=MG` para filtrar por UF.

---

## Navegação

- [Arquitetura](architecture.md)
- [Autenticação](authentication.md)
- [Padrões de resposta](responses.md)
- [Paginação](pagination.md)
- [Manutenção](maintenance.md)
- [Contribuição](contributing.md)
- [Roadmap](roadmap.md)
