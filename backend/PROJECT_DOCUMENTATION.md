# Project Documentation
Observatório Econômico — Backend

---

## CHANGELOG

### v1.5 — IPS e Estrutura de Ingestão (atual)

**Backend:**
- `IpsMunicipio` — tabela `ips_municipio` com 79 colunas de métricas, unicidade `(municipio_id, ano)` (migração `68bbe475...`)
- 7 endpoints `/ips/*`: `municipios`, `scorecard`, `evolucao`, `ranking`, `comparativo`, `destaques`, `sugestoes`
- IPS não filtra por `municipio_id` — dados públicos de benchmarking acessíveis a todos os usuários autenticados
- `carregar_ips.py` — ingestão de CSV nacional `dados/ips/ips_brasil_municipios_{ano}.csv`, suporta `--ano` e `--estado`

**Frontend:**
- Página `/app/ips` — seletor estado→cidade, scorecard com 79 métricas, ranking nacional e estadual, radar chart por dimensão, drill-down de componentes, evolução ano a ano, comparativo com pares similares (por PIB per capita)
- Entrada IPS adicionada ao sidebar como link standalone (após Benchmark)

**Ingestão:**
- Refactor para estrutura por município: `dados/{city}/` com scripts padronizados
- Argumento `--ibge` para código IBGE na ingestão

---

### v1.4 — Gestão, Projetos e Dados Internos

**Backend:**
- `PUT /usuarios/{id}` + `DELETE /usuarios/{id}` — editar e excluir usuários (ADMIN_GLOBAL)
- `CagedMovimentacao.admissões` renomeado para `admissoes` (migração 0017)
- `ProjetoEixo` + `Projeto` — eixos estratégicos e projetos municipais (migração 0018)
- `IndicadorInterno` + `PlanoGovAcao` + `EventoMunicipio` — módulo Dados Internos (migração 0019)
- Routers: `/projetos`, `/dados_internos`
- Todos os loaders individuais agora aceitam `--estado` via argparse

**Frontend:**
- `ChartInfoIcon` — ícone ⓘ editável em cabeçalhos de gráficos (reusa IndicadorInfo)
- `ToastContext` — sistema de notificações (sucesso/erro) global em todos os layouts
- `useEscapeKey` — hook para fechar modais com ESC em todas as páginas
- Página `/app/projetos` — eixo tabs + cards de projeto com status badge
- Página `/app/timeline` — Timeline do Mandato como página dedicada (removida do Dashboard)
- Páginas `/app/dados-internos/{indicadores,plano-gov,calendario}` — módulo CRM interno
- Admin `/admin/projetos-eixos` — gestão de eixos (ADMIN_GLOBAL)
- UX: aria-labels, password toggle, skeleton loading, animações com ease-out/in

**Dev:**
- `.devcontainer/` com Python 3.11 + Node 20 + PostgreSQL 16

---

### v1.3 — Multi-Estado

**Ingestão:**
- Todos os 11 loaders agora aceitam `estado` como parâmetro
- `obter_ou_criar_municipio(db, nome, estado, codigo_ibge=None)` com dedup por IBGE + fallback `(nome, estado)`
- `carregar_tudo.py` com argparse: `--estado` (obrigatório) + `--cidades` (opcional)
- PIX loader reestruturado para usar `BASE_PATH = "dados/PIX"` (scan de CSVs)
- PIX adicionado ao `LOADERS` de `carregar_tudo.py`

**API:**
- Todos os endpoints de comparativo retornam `municipio_id` + `estado`
- Filtro opcional `?estado=MG` em todos os 11 endpoints comparativo/ranking

**Frontend:**
- Benchmark com dropdown de UF (só exibido quando há múltiplos estados)
- Chart Y-axis mostra `"Município (UF)"`
- Tabela do benchmark tem coluna UF
- UsuariosAdminPage com seletor de estado filtrando o dropdown de municípios

---

### v1.2 — Plataforma SaaS

- Três planos: `free` / `pro` / `premium`
- `PlanoConfig` por plano, configurável via admin
- `PlanGate` + `PlanContext` no frontend para blur/bloqueio por componente
- `IndicadorInfo` — tooltips e descrições editáveis por KPI
- Notificações: `Notificacao` + `NotificacaoLida`, bell icon no header
- Benchmark Municipal: 11 datasets em tabs com ranking e highlight do município
- Dashboard de Insights com alertas
- Migrações: 0011 → 0016

---

### v1.1 — Datasets Completos

- 11 datasets com ingestão CSV e endpoints completos
- CAGED: 5 tabelas (movimentação, por sexo, por raça, por CNAE, salário)
- RAIS: 9 tabelas (vínculos, por sexo, por raça, por CNAE, faixa etária, escolaridade, faixa salarial, tempo emprego, métricas anuais)
- PIB com ranking entre municípios
- Empresas com capital social por porte
- ESTBAN com breakdown por instituição
- Comex com peso físico e breakdown por produto/país
- Dropped: colunas sempre-NULL `setor` de CAGED e RAIS

---

### v1.0 — Base

- FastAPI + SQLAlchemy + Alembic + JWT
- RBAC: ADMIN_GLOBAL, ADMIN_MUNICIPIO, VISUALIZADOR
- Middleware de auditoria (correlation ID + logging)
- Datasets iniciais: Arrecadação, PIB, CAGED, RAIS, Bolsa Família, INSS, PIX
- Migração inicial: 0001_initial_schema_and_roles

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL PostgreSQL completa |
| `SECRET_KEY` | Sim | Chave JWT (mínimo 32 chars) |
| `ALGORITHM` | Não (default: HS256) | Algoritmo JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Não (default: 30) | Expiração access token |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Não (default: 7) | Expiração refresh token |
| `CORS_ORIGINS` | Sim | Origens permitidas, separadas por vírgula |

---

## Guia de Deploy

### Desenvolvimento

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Produção (Gunicorn + Uvicorn)

```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Docker

```bash
docker-compose up --build
```

### Nginx (reverse proxy)

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## Guia de Ingestão

```bash
# Todos os municípios de MG
python -m ingestao.carregar_tudo --estado MG

# Cidades específicas
python -m ingestao.carregar_tudo --estado MG --cidades Divinopolis "Para de Minas" Oliveira

# Outro estado
python -m ingestao.carregar_tudo --estado MT --cidades Cuiaba

# PIX: colocar CSVs em dados/PIX/ antes de executar
```

Loaders individuais (fallback para `estado="MG"`):
```bash
python -m ingestao.carregar_arrecadacao
python -m ingestao.carregar_caged
# ... etc
```

---

## Autenticação

```
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded
username=email&password=senha
→ { "access_token": "...", "refresh_token": "...", "token_type": "bearer" }

POST /api/v1/auth/refresh
{ "refresh_token": "..." }
→ { "access_token": "..." }

Authorization: Bearer {access_token}  ← em todas as requisições
```

---

## Segurança Recomendada

- Rotação periódica de `SECRET_KEY`
- CORS restrito aos domínios de produção
- HTTPS obrigatório em produção
- Backup automático do banco PostgreSQL
- Monitorar logs para erros 500 (indicam bugs, não CORS)
- Rate limiting futuro para endpoints públicos
