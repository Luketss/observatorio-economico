# Roadmap

## Concluído

### v1.0 — Base
- Arquitetura FastAPI + SQLAlchemy + Alembic
- JWT access + refresh token
- RBAC: ADMIN_GLOBAL, ADMIN_MUNICIPIO, VISUALIZADOR
- Middleware de auditoria (correlation ID + logging)

### v1.1 — Datasets
- 11 datasets completos: Arrecadação, PIB, CAGED, RAIS, Bolsa Família, Pé-de-Meia, INSS, ESTBAN, Comex, Empresas, PIX
- Scripts de ingestão CSV para todos os datasets
- Endpoints de série temporal + breakdown (por sexo, raça, CNAE, etc.)

### v1.2 — Plataforma SaaS
- Três planos: free / pro / premium
- `PlanoConfig` configurável por plano via admin
- `PlanGate` frontend para blur/bloqueio de componentes
- `IndicadorInfo` — tooltips e descrições de KPIs por dataset
- Benchmark Municipal (ComparativoPage) com 11 datasets
- Notificações push (Notificacao + NotificacaoLida + bell icon)
- Alertas de insights no DashboardGeral

### v1.3 — Multi-estado
- `Municipio.estado` como campo de UF
- Ingestão via `--estado` CLI arg (`carregar_tudo.py`)
- Unicidade por código IBGE + fallback `(nome, estado)`
- Filtro `?estado=MG` em todos os endpoints de comparativo
- Benchmark com dropdown de UF
- UsuariosAdminPage com filtro de estado

### v1.4 — Gestão, Projetos e Dados Internos
- **Usuários**: editar e excluir usuários (ADMIN_GLOBAL), password toggle, toasts de feedback
- **Chart tooltips**: `ChartInfoIcon` reutiliza IndicadorInfo para descrições editáveis em todos os gráficos
- **Projetos**: menu dedicado com eixos estratégicos (ADMIN_GLOBAL cria eixos, ADMIN_MUNICIPIO gerencia projetos) — migrations `0018`
- **Timeline do Mandato**: movida para página própria (`/app/timeline`), removida do Dashboard
- **Dados Internos**: módulo CRM com 3 sub-páginas — migrations `0019`
  - `Indicadores Internos`: inserção de dados por área temática (energia, saúde, etc.)
  - `Plano de Governo`: ações por secretaria com kanban (Não iniciado / Em andamento / Concluído)
  - `Calendário`: grade mensal com eventos coloridos por tipo
- **UX**: toast global (`ToastContext`), hook `useEscapeKey`, `aria-label` em todos os botões de ícone, skeleton loading, animações com ease-out/in
- **Dev container**: `.devcontainer/` com Python 3.11 + Node 20 + PostgreSQL 16

### v1.5 — IPS e Estrutura de Ingestão
- **IPS (Índice de Progresso Social)**: 79 métricas por município, cobertura nacional (5.570 cidades), anos 2024 e 2025
  - Tabela `ips_municipio` com unicidade `(municipio_id, ano)`
  - Script `carregar_ips.py` com filtro por estado e upsert idempotente
  - 7 endpoints: scorecard, ranking, evolução, comparativo, destaques, sugestões, lista de municípios
  - Frontend `/app/ips`: seletor estado→cidade, scorecard, radar chart, drill-down, evolução, comparativo com pares similares
- **Refactor de ingestão**: estrutura por município (`dados/{city}/`) com scripts padronizados; `--ibge` para código IBGE na ingestão

### v1.6 — CAGED Expandido
- **3 novos breakdowns CAGED**: escolaridade, faixa etária e tipo de movimentação
  - Tabelas: `caged_por_escolaridade`, `caged_por_faixa_etaria`, `caged_por_tipo_movimentacao`
  - 3 novos endpoints: `/caged/por_escolaridade`, `/caged/por_faixa_etaria`, `/caged/por_tipo_movimentacao`
  - 3 novos gráficos na página CAGED: educação, idade e motivo de entrada/saída
- **Correções de bugs no frontend CAGED**:
  - Filtro de mês/ano corrigido (era comparado isoladamente, agora usa `ano*100+mes`)
  - Null guards em todas as agregações (`?? 0`)
  - Skeletons de carregamento em todos os gráficos
  - Banner de erro visível quando API falha (antes silenciava no console)
  - Chave `item["admissões"]` (com acento) corrigida para `item.admissoes`

---

## Próximo (v1.7)

- **Exportação de dados**: CSV download por página/dataset
- **Busca textual**: filtro por nome em listagens admin
- **Testes automatizados**: pytest para endpoints críticos

---

## Médio prazo

- Cache Redis para endpoints de comparativo (queries custosas)
- Rate limiting nos endpoints públicos
- Suporte a múltiplos anos simultâneos no benchmark (comparação temporal)
- Export de gráficos como PNG/SVG

---

## Longo prazo

- Integração direta com APIs governamentais (atualização automática)
- Alertas automáticos de variações anômalas (variação > X% aciona notificação)
- Mapa geoespacial por município
- Relatórios PDF gerados no servidor
