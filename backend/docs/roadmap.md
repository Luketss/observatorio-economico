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

---

## Próximo (v1.4)

- **Exportação de dados**: CSV download por página/dataset
- **Gestão de marcos**: marcos históricos do município na timeline
- **Custom cards**: cards personalizáveis no DashboardGeral
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
