# Ideias de Melhorias — Observatório Econômico Municipal

Backlog de funcionalidades e melhorias identificadas. Organizadas por impacto e esforço estimado.

---

## ⭐ Diferencial Estratégico

### Índice de Saúde Econômica Municipal (ISEM)
Score proprietário 0-100 (ou grade A-E) calculado automaticamente a partir de todos os datasets.
- **O grande diferencial**: métrica única, citável, comparável entre municípios e rastreável no tempo
- Componentes sugeridos: Emprego (CAGED/RAIS), Arrecadação, Atividade Econômica (PIB/Comex/Empresas), Bem-Estar Social (Bolsa Família/INSS)
- Exibido com destaque no Dashboard Geral: nota atual + variação vs mês anterior + posição no ranking nacional
- Evolução histórica: gráfico de linha mostrando o ISEM ao longo dos meses
- Backend: endpoint `/isem/{municipio_id}` calcula os sub-scores e retorna JSON
- Modelo novo: `IsemHistorico` (municipio_id, periodo, score, sub_scores JSON)

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
- Ex: linha tracejada "Média Nacional" no gráfico de CAGED
- Dados de referência podem vir de uma tabela separada ou valor fixo configurável

### Forecast / Tendência Automática nos Gráficos
Extensão pontilhada nos gráficos de série temporal mostrando para onde o indicador tende nos próximos 2-3 meses.
- Regressão linear simples sobre os últimos 6 pontos — cálculo 100% frontend (JS)
- Recharts suporta `ReferenceLine` e `ReferenceArea` nativamente
- Exibido com visual diferente (dashed, cor suavizada) para não confundir com dado real
- Badge "Projeção" com tooltip explicando a metodologia
- Sem novo endpoint de backend; sem migração

### Narrativa Cross-Dataset ("Síntese do Mês")
Card na dashboard geral com um parágrafo de IA que conecta os insights de **todos** os datasets numa narrativa coerente.
- Exemplo: "O CAGED registrou saldo positivo enquanto a arrecadação caiu — possível informalização do trabalho."
- Novo dataset `geral_sintese` no sistema de insights existente
- Prompt especial que recebe os bullets de todos os outros insights como input
- Aparece no topo do Dashboard Geral como destaque editorial
- Reusa a infra de `insights_service.py` sem mudanças de arquitetura

### Compartilhamento de Gráficos via Imagem
Botão "Compartilhar" em cada gráfico que gera um PNG para download ou copiar.
- Biblioteca `html2canvas` captura o elemento SVG do Recharts
- Inclui logo do observatório + nome do município + período no rodapé
- Botão "Copiar imagem" para colar direto no WhatsApp/PowerPoint
- Zero dependência de backend

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

### Relatório Executivo Automático Mensal (PDF por Email)
Todo mês, o sistema gera e envia automaticamente um relatório PDF completo para o admin do município.
- Job agendado (APScheduler ou cron Railway) dispara no dia 15 de cada mês
- Coleta todos os insights ativos + KPIs principais + variações YoY
- Monta PDF via `WeasyPrint` ou `reportlab` no backend (sem dependência de browser)
- Prefeito recebe um documento profissional no email sem precisar logar
- Campo `email_relatorio` no model `Municipio` (pode ser diferente do email de login)
- Configurável: admin pode ativar/desativar e escolher o dia de envio

### Chat com os Dados (Copilot Municipal)
Interface conversacional onde o usuário faz perguntas em linguagem natural sobre os dados do seu município.
- Botão flutuante no canto inferior direito: "Pergunte ao Copilot"
- Exemplos: "Quantas empresas abriram no Q1?", "Como está o emprego comparado ao ano passado?"
- Backend monta contexto com os últimos dados de todos os datasets + envia para Claude
- Histórico da conversa mantido na sessão (sem persistir no banco)
- Resposta em texto + referência ao dataset de origem ("Segundo o CAGED de fev/2025...")
- Reusa a infra de chamada ao Claude já existente em `insights_service.py`

### Modo Apresentação (Kiosk / Slideshow)
Botão "Apresentar" que coloca o dashboard em tela cheia rotacionando automaticamente pelas páginas.
- Ideal para TVs em salas de reunião, recepções de prefeituras, apresentações em gabinete
- Intervalo configurável (15s / 30s / 60s por página)
- Cada "slide" mostra KPIs + gráfico principal da página, sem menus laterais
- Tecla ESC ou clique saem do modo
- Implementação: React context `PresentationMode` + CSS Fullscreen API

### Relatório de Mandato — Balanço da Gestão
Página dedicada que compara cada indicador do **início do mandato** até hoje.
- Usa o `Marco` de tipo `início_mandato` como data-base (modelo já existe)
- Mostra delta absoluto e percentual para cada dataset: arrecadação +23%, emprego +1.450 postos, etc.
- Destaca os 3 maiores avanços e (opcionalmente) os desafios
- Gera release de IA automaticamente com o balanço narrativo
- Botão "Gerar PDF do Balanço" — documento pronto para divulgação à imprensa
- Página: `/gestao/balanco`

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

### Mapa Nacional dos Municípios (ADMIN_GLOBAL)
Para o administrador global, um mapa do Brasil com os municípios cadastrados coloridos por indicador selecionado.
- Biblioteca: `react-simple-maps` (leve, SVG-based, sem tile servers)
- Seletor de indicador: CAGED, Arrecadação, ISEM, etc.
- Escala de cor tipo heatmap (verde → vermelho)
- Clique no município abre o dashboard daquele município
- Excelente para demos de produto e gestão do portfólio de clientes

### Agendamento Inteligente de Insights
Sistema que detecta quando novos dados são ingeridos e dispara geração automática de insights.
- Após cada ingestão de CAGED/RAIS/etc., chama `/insights/gerar` automaticamente
- Admin configura quais datasets disparam geração automática
- Log de geração automática visível no painel de insights
- Elimina o trabalho manual de "clicar em gerar" após cada ingestão

### Anotações nos Gráficos
Admins podem fixar notas em pontos específicos dos gráficos de série temporal.
- Exemplo: "Inauguração da nova fábrica" marcado em abr/2024 no gráfico de CAGED
- Ícone de marcador (flag) visível no gráfico; hover mostra o texto
- Conecta causa → efeito, muito valorizado por prefeitos que querem narrar sua gestão
- Modelo novo: `GraficoAnotacao` (municipio_id, dataset, periodo, texto)
- Frontend: `ReferenceLine` do Recharts com label customizado

### Painel de Saúde da Plataforma (ADMIN_GLOBAL)
Dashboard interno para monitorar a qualidade dos dados de todos os municípios.
- Tabela: município, último dado de cada dataset, insights gerados, último acesso
- Alertas visuais para municípios com dados desatualizados há mais de 60 dias
- Exportar lista completa em CSV
- Essencial para operar um SaaS multi-tenant com qualidade

### Histórico de Versões de Insights
Ao regenerar um insight de IA, o sistema mantém a versão anterior acessível.
- Botão "Ver histórico" no card do insight abre um modal com versões anteriores
- Cada versão tem timestamp, modelo e conteúdo
- Permite comparar como a narrativa mudou conforme os dados evoluíram
- Implementação: tabela `InsightIAHistorico` ou campo `versao` em `InsightIA`

---

## Distribuição & Viralidade

### Certificados de Desempenho Automáticos
Quando um indicador supera um milestone, o sistema gera automaticamente um certificado compartilhável.
- Exemplo: "Nova Lima registrou crescimento de 15% no emprego formal em 2024"
- Template PNG/PDF gerado no backend
- Compartilhável em redes sociais com 1 clique
- ADMIN_GLOBAL define os thresholds de cada certificado
- Gamificação leve que motiva prefeitos a divulgar o produto organicamente

---

## Notas Técnicas

- Stack atual: FastAPI + SQLAlchemy 2.0 + PostgreSQL + React JSX + Tailwind + Recharts
- Multi-tenant: RBAC com roles ADMIN_GLOBAL / ADMIN_MUNICIPIO / VISUALIZADOR
- Deploy: Railway (backend + frontend + PostgreSQL)
- Ingestion: scripts Python locais, conectam direto na Railway DB
- Novas bibliotecas sugeridas:
  - `html2canvas` — captura de gráficos como imagem (frontend)
  - `react-simple-maps` — mapa do Brasil SVG (frontend)
  - `WeasyPrint` ou `reportlab` — geração de PDF no backend
  - `APScheduler` — jobs agendados no backend (relatório mensal)
  - `fastapi-mail` — envio de emails transacionais
