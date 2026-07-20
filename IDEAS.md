# Ideias de Melhorias — Observatório Econômico Municipal

Backlog de funcionalidades e melhorias identificadas. Organizadas por impacto e esforço estimado.

---

## IA — Próximos Passos

Direções de IA brainstormadas em 2026-05-17. A primeira está em design fechado; as outras três ficam aqui como follow-ups com escopo definido.

### 🟢 Prioridades do Mês (em design — spec aprovado)
Painel no topo da Dashboard Geral com as 3 observações estratégicas mais relevantes do mês cruzando todos os datasets, cada uma com drill-down para a página de origem.
- Reusa `InsightIA` + `insights_service.py` (sem migração).
- Geração ADMIN_GLOBAL única por mês, cacheada em `(municipio_id, dataset='prioridades', periodo='YYYY-MM')`.
- Spec: [`docs/superpowers/specs/2026-05-17-prioridades-do-mes-design.md`](docs/superpowers/specs/2026-05-17-prioridades-do-mes-design.md)

### Auto-preenchimento de formulários via CNPJ / URL de edital
Reduzir fricção dos formulários do módulo Desenvolvimento Econômico.
- **Retenção & Expansão**: digitar/colar um CNPJ → backend chama API pública (BrasilAPI / ReceitaWS) e preenche nome, setor, porte, situação. IA opcional para inferir setor padronizado quando o CNAE for ambíguo.
- **Captação de Recursos**: colar a URL de um edital → backend faz fetch da página, IA extrai título, entidade, valor, prazo e descrição em JSON estruturado.
- **Empresas (admin)**: import em lote via lista de CNPJs com auto-fill.
- Dependências externas: BrasilAPI (estável, gratuita) para CNPJ; scraping de edital é frágil — começar com 2-3 portais comuns (gov.br, FNDE, BNDES).
- Risco: variabilidade dos formatos de edital. Mitigação: AI extrai o que conseguir, deixa em branco quando inseguro, admin completa.

### Alertas com explicação de causa pela IA
Distinto do "Alertas Automáticos por Email" já listado abaixo (que é threshold-based puro). Aqui a IA contextualiza a anomalia.
- Job noturno (APScheduler) varre cada dataset por município, sinaliza variações atípicas vs. baseline histórico do próprio município.
- Para cada anomalia, chama Claude com (a) a série histórica, (b) regras do dataset (herda os prompts de `insights_service.py`), (c) pergunta: "isso é sazonal/metodológico/atípico? sugira próximo passo de análise".
- Saída alimenta o `NotificationBell` existente como notificação tipada (`tipo='alerta_ia'`).
- Reusa: `Notificacao` + `NotificacaoLida` (já existem).
- Dependências: APScheduler (também necessário para "Relatório Executivo Mensal"). Mitigação de falso-positivo: percentil-based threshold por dataset, calibrado nas primeiras semanas.

### "Pergunte aos seus dados" (precursor leve do Copilot Municipal)
Barra de busca em linguagem natural no topo de cada página de dataset, escopada ao dataset daquela página.
- Mais leve que o "Chat com os Dados (Copilot Municipal)" listado abaixo — sem histórico de conversa, sem botão flutuante global, sem cruzamento entre datasets.
- Pergunta + dados do dataset atual → 1 chamada Claude → resposta + citação ("Segundo CAGED jan/2026...").
- Reusa a montagem de contexto que já existe em `_fetch_dados` por dataset.
- Boa pavimentação para o Copilot completo depois (mesmo padrão de prompt, escopo expandido).
- Decisão de UX a tomar mais tarde: respostas em modal, em painel lateral, ou inline abaixo da barra.

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

## 🎯 Máquina de Vendas — Momento "Uau" na Demo

Brainstorm de 2026-07-06 focado em **aquisição**: o gargalo de venda é impressionar na demo (plateias mistas — prefeito, secretários, assessores). Ideias organizadas pela mecânica de fechamento. Priorizadas: Demo Express (A1), Alerta FPM (B1), Raio-X pré-demo (A2) e Modo Rivalidade (C1).

### A. "Isso é a SUA cidade" — personalização instantânea

#### Demo Express — ingestão automática por código IBGE 🔥 (grande aposta) — ✅ NÚCLEO ENTREGUE (jul/2026, pipeline de background)
Pipeline que baixa e ingere automaticamente os principais datasets de qualquer município a partir do código IBGE — sem CSV manual.
- **Venda**: "me fala o nome da sua cidade" → minutos depois a demo roda com os dados reais dela
- **Operação**: onboarding de cliente cai de dias para minutos; atualização mensal vira botão/cron

**O que já existe (jul/2026)** — infra completa + 10 fontes automáticas em `/admin/fontes`:
- Execução em **background job** (tabela `ingestao_job` + runner com heartbeat, trava global, polling com barra de progresso, histórico, retomada pós-refresh) — por município, múltiplos municípios (chips), UF ou Brasil inteiro
- Fontes automáticas: população (IBGE), FPM (STN), captação federal (SICONV), emendas (Portal da Transparência), **PIB (IBGE 5938), PIX (Bacen/Olinda), Comex (MDIC), ESTBAN (Bacen), Bolsa Família e Pé-de-Meia (Portal)**
- CSV manual continua como fallback (reingest por upload)
- **Execução one-click de todas as fontes** (jul/2026): meta-job `dataset="todas"` encadeia as 10 fontes na ordem certa (população primeiro; captação/emendas por último), com isolamento de falha por fonte e captação expandida para a UF dos municípios selecionados

**O que falta para o Demo Express completo**:
- Fontes pesadas (microdados GB): **CAGED, RAIS, Empresas/CNPJ** — exigem worker separado no Railway (a tabela de jobs já suporta; mover o executor)
- Fontes estaduais: **arrecadação e VAF** (portais SEF por UF, sem API padronizada)
- **IPS** (xlsx anual) e **INSS** (fonte a confirmar)
- **Agendamento/cron** (atualização mensal automática por fonte) e **cancelamento** de job em andamento
- Novos domínios: saúde (SIOPS), educação (SIOPE/IDEB) etc. — ver "Expansão de domínio"
- Follow-ups operacionais: re-rodar bolsa_familia 2023–2025 (legado ~10× inflado, upsert corrige); TLS chain incompleta do Comex Stat (usar `truststore` se der erro em prod); teste de integração do ticker/heartbeat antes dos datasets GB

#### Raio-X pré-demo — a isca de reunião (dias)
Um clique do ADMIN_GLOBAL gera PDF de 1 página: "Raio-X Econômico de [Cidade]" com os 5 fatos mais provocativos encontrados pela IA.
- Ex.: "perdeu 340 empregos no setor X enquanto vizinhos ganharam"; "arrecadação per capita 23% abaixo dos pares"
- Enviado **antes** da reunião — o prefeito chega curioso e a demo vira a resposta às perguntas que o PDF plantou
- Reusa `insights_service.py` + geração de PDF (WeasyPrint/reportlab)

#### Tema white-label instantâneo (dias)
Aplicar a identidade visual da prefeitura na UI automaticamente — a demo abre "vestida" com a cara deles.
- Extrair cores dominantes do brasão (campo já existe, migration 0007) ou 2 cores configuráveis no admin
- CSS variables no tema Tailwind; wow sutil mas eficaz: parece que o produto já é da prefeitura

#### Trial pós-demo com expiração (semanas)
Ao fim da reunião: "vou deixar liberado por 7 dias para vocês explorarem".
- Conta com flag `is_demo` (já existe) + marca d'água + expiração automática
- E-mail no meio do trial: "seu município teve X novidades esta semana"
- O fechamento continua acontecendo depois da sala

### B. "Você está perdendo dinheiro" — ROI que se paga na hora

#### Alerta de faixa do FPM 🔥 (melhor custo-benefício) — ✅ ENTREGUE (jul/2026, PR #40)
O FPM é pago por faixas populacionais — cruzar população (IBGE) com as faixas de coeficiente.
- "Sua cidade está a 812 habitantes de mudar de coeficiente — vale ~R$ 2,3M/ano a mais"
- Alerta inverso: risco de cair de faixa na próxima estimativa do IBGE
- Nenhum dashboard mostra isso; todo prefeito de cidade pequena entende em 5 segundos
- Justifica o contrato sozinho — argumento de venda de uma frase com cifrão

#### Dinheiro na mesa — captação vs. pares (semanas/meses) — ✅ ENTREGUE (jul/2026, feat/captacao-emendas)
Quanto o município captou em convênios, emendas e transferências voluntárias vs. municípios do mesmo porte.
- Fonte: Portal da Transparência / Transferegov
- "Municípios pares captaram em média R$ 4,2M; você captou R$ 1,1M"
- Conecta direto com o módulo Captação de Recursos existente — o diagnóstico vira o funil de entrada dele

#### Radar de emendas parlamentares (semanas) — ✅ ENTREGUE (jul/2026, feat/captacao-emendas)
Emendas destinadas ao município: quem enviou, valor, status de execução.
- Fonte pública: Transferegov / SIGA Brasil
- Politicamente valioso — o prefeito quer saber quais deputados estão (ou não) mandando recurso

### C. "Vença a comparação" — rivalidade regional

#### Modo Rivalidade na demo (dias)
Preset "sua cidade vs. [rival]" com 6 KPIs lado a lado, verde/vermelho por indicador, 1 clique.
- Todo prefeito tem um rival regional; rivalidade é emocional e fecha venda que planilha não fecha
- É o Comparativo existente reembalado como arma de demo — falta só o enquadramento/UX

#### Replay do Mandato — time-travel animado (semanas)
Slider temporal que **anima** todos os KPIs do início do mandato até hoje.
- Números subindo, gráficos crescendo, marcos pipocando na linha do tempo (Framer Motion já no stack)
- Diferente do Relatório de Mandato (estático): isso é teatro para demo e para o prefeito reviver a própria gestão
- Encerramento de demo memorável

#### Retrato do Censo 2022 (semanas)
Novo dataset IBGE: pirâmide etária, domicílios, crescimento populacional.
- Visualmente rico (pirâmide etária animada), contextualiza todos os outros datasets
- Alimenta o Alerta de faixa do FPM (população oficial + estimativas)

### D. "Defesa da gestão" — o ângulo político-emocional

#### Sala de Resposta (war room) (semanas)
A oposição diz "o desemprego explodiu" → o prefeito cola a crítica no sistema → IA busca os dados reais e gera resposta fundamentada com números citáveis e gráfico anexável.
- Nenhum concorrente tem; para o prefeito é **munição**, vale mais que relatório
- Complementa o gerador de documentos do backlog, com gatilho emocional muito mais forte
- Reusa infra de contexto de `insights_service.py` (cruza datasets relevantes à crítica)

#### Gerador de discurso com números reais (dias, extensão do war room)
"Vou falar na câmara sobre emprego" → discurso pré-escrito com os dados verdadeiros do município encaixados.
- Economiza horas da assessoria; cria dependência saudável do produto
- Mesmo padrão de prompt do gerador de documentos já planejado

---

## Notas Técnicas

- Stack atual: FastAPI + SQLAlchemy 2.0 + PostgreSQL + React JSX + Tailwind + Recharts
- Multi-tenant: RBAC com roles ADMIN_GLOBAL / ADMIN_MUNICIPIO / VISUALIZADOR
- Deploy: Railway (backend + frontend + PostgreSQL)
- Ingestion: esteira in-app de fontes automáticas com background jobs (`/admin/fontes`, 10 fontes em jul/2026); scripts Python locais (`backend/ingestao/`) e upload de CSV permanecem como fallback
- Novas bibliotecas sugeridas:
  - `html2canvas` — captura de gráficos como imagem (frontend)
  - `react-simple-maps` — mapa do Brasil SVG (frontend)
  - `WeasyPrint` ou `reportlab` — geração de PDF no backend
  - `APScheduler` — jobs agendados no backend (relatório mensal)
  - `fastapi-mail` — envio de emails transacionais


Norte: fechar o ciclo "diagnóstico → decisão → ação → resultado"
Hoje os módulos (dados, Indicadores Internos, Projetos, Desenv. Econômico, Releases) são ilhas. A maior alavanca é conectá-los num ciclo de gestão:

Da evidência à ação: um insight ("emprego caindo no setor X") vira, com 1 clique, uma meta (Indicador Interno) → um projeto (Projetos) → acompanhamento → e o sistema mede se o indicador reagiu. Isso transforma o produto de "informativo" em "operacional".
Recomendador de projetos/editais: dado o diagnóstico do município, sugerir projetos e editais de captação relevantes (liga Desenvolvimento Econômico aos dados). "Seu IPM caiu; municípios pares investiram em Y; há edital Z aberto."

🤖 Copiloto de gestão (IA conversacional, além dos insights estáticos)
Pergunte aos dados: chat que responde "como está a arrecadação vs ano passado?", compara municípios, explica um gráfico — sobre TODOS os dados do município.
Gerador de documentos: ofícios, justificativas de captação, relatórios de gestão, prestação de contas — pré-preenchidos com os dados. Economiza horas das secretarias e cria dependência saudável do produto.
Simulador "e se?": "se atrairmos uma indústria de porte X do setor Y, qual o impacto estimado em emprego, arrecadação e IPM?" — usa as relações entre datasets.

🔮 Inteligência preditiva e de risco
Módulo de Projeções: além do ICMS, projetar arrecadação total, emprego e PIB com bandas de confiança (já temos forecast nos gráficos — virar um módulo de verdade).
Índice de Saúde Fiscal / Early-warning: score sintético + alertas de tendência (dependência de transferências, queda sustentada de arrecadação, sangria de empresas).
Detecção de oportunidades/vazios: "CNAEs presentes nos pares e ausentes aqui" = oportunidades de atração; "setores em ascensão".

🗺️ Inteligência comparativa e geoespacial
Municípios-pares ("gêmeos"): agrupar por porte/perfil/região e mostrar "você está no percentil X entre seus pares" — muito mais útil que ranking estadual cru.
Camada de mapa: coroplético por região/estado e fluxos (Comex origem-destino; migração de emprego entre municípios via o campo outro_municipio do CAGED). Mapa muda a percepção de valor.
Granularidade intra-municipal (por bairro/setor censitário) onde a fonte permitir — diferencial enorme para gestão local.

📡 Alcance, transparência e distribuição
Portal público / transparência white-label: páginas read-only embarcáveis no site da prefeitura (LGPD-safe). Atende exigência legal e vira canal de aquisição.
Boletins automáticos (e-mail/WhatsApp) recorrentes ao prefeitao/secretários + releases distribuídos à imprensa local automaticamente (expande o módulo Releases).
PWA/mobile para o gestor consultar no celular; API/embeds para portais e jornais.

🌎 Expansão de domínio (novos datasets que destravam features)
Visão 360°: saúde (SIOPS), educação (SIOPE/IDEB), segurança (SINESP), finanças (SICONFI/Tesouro), transferências (FPM) — sai do "econômico" para "gestão municipal completa".
Licitações/contratos/despesas → eficiência do gasto, um tema quente politicamente.