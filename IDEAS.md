# Ideias de Melhorias — Observatório Econômico Municipal

Backlog de funcionalidades e melhorias identificadas. Organizadas por impacto e esforço estimado.

---

## Em Desenvolvimento

### ✅ Insights IA (em andamento)
Geração automática de análises por dataset usando a API do Claude (Anthropic).
- Insights gerados no servidor e armazenados por município + dataset
- Painel "Insights IA" em cada página do dashboard
- Botão para regenerar insights sob demanda
- 4 bullets em português com tendências, anomalias e pontos de atenção

---

## Alto Impacto / Baixo Esforço

### Exportação PDF / Excel
Botão de exportação em cada página para gerar relatórios compartilháveis.
- Prefeitos e secretários precisam apresentar dados em reuniões
- PDF com gráficos renderizados + tabela de dados
- Excel com dados brutos para análises externas
- Biblioteca sugerida: `react-pdf` ou `jspdf` (frontend)

### Badge de Atualização dos Dados
Indicador visual de quando cada dataset foi carregado pela última vez.
- Constrói confiança com o usuário
- Pequena tag "Atualizado em DD/MM/AAAA" no topo de cada página
- Implementado com campo `ultima_atualizacao` por municipio+dataset

### Benchmark Nacional / Estadual
Linha de referência nos gráficos mostrando média estadual ou nacional.
- Contextualiza os números do município
- Ex: linha tracejada "Média MG" no gráfico de CAGED
- Dados de referência podem vir de uma tabela separada ou valor fixo configurável

---

## Alto Impacto / Médio Esforço

### URL Pública por Município (Portal da Transparência)
Versão read-only do dashboard sem necessidade de login, compartilhável com cidadãos.
- Aumenta o valor percebido do produto para prefeitos (mostra transparência)
- Rota pública: `/municipio/{slug}` com todos os dados do município
- Sem funcionalidades de edição ou admin
- Pode ser usado como argumento de venda ("portal de transparência incluso")

### Alertas Automáticos por Email
Notificações automáticas quando indicadores atingem thresholds críticos.
- Exemplos: saldo CAGED negativo por 3 meses consecutivos, Bolsa Família cresce >20%, arrecadação cai >15%
- Email para o admin do município configurável
- Thresholds configuráveis por município
- Biblioteca sugerida: `fastapi-mail` ou integração com SendGrid/Resend

### Comparativo de Municípios Aprimorado
Evolução da página `/comparativo` com visualizações mais ricas.
- Radar chart com 5-6 indicadores lado a lado
- Tabela de ranking dos municípios cadastrados
- Permite comparar 2-4 cidades simultaneamente
- Identifica o município com melhor desempenho em cada indicador

---

## Médio Impacto

### Metas Municipais
Permite que admins definam metas para indicadores e acompanhem o progresso.
- Ex: "Reduzir desemprego para 8% até dezembro de 2025"
- Barra de progresso visual em cada indicador com meta definida
- Histórico de metas e resultados alcançados
- Novo modelo: `Meta` (municipio_id, dataset, indicador, valor_meta, data_limite, ativo)

### Timeline do Mandato
Sobreposição de marcos políticos nos gráficos de série temporal.
- Permite ao prefeito visualizar o impacto de políticas nos indicadores
- Linhas verticais marcando início de mandato, grandes obras, eventos
- Configurável pelo admin do município
- Novo modelo: `Marco` (municipio_id, data, descricao, tipo)

### Redesign Mobile-First
Otimização da interface para uso em smartphones e tablets.
- Prefeitos frequentemente checam dados pelo celular
- Sidebar colapsável em mobile
- Gráficos responsivos com scroll horizontal em telas pequenas
- Cards KPI empilhados verticalmente em mobile

---

## Notas Técnicas

- Stack atual: FastAPI + SQLAlchemy 2.0 + PostgreSQL + React JSX + Tailwind + Recharts
- Multi-tenant: RBAC com roles ADMIN_GLOBAL / ADMIN_MUNICIPIO / VISUALIZADOR
- Deploy: Railway (backend + frontend + PostgreSQL)
- Ingestion: scripts Python locais, conectam direto na Railway DB
