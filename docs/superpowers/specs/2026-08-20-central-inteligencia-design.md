# Central de Inteligência (Fase 5 da reorganização em 5 eixos) — Design

**Data:** 2026-08-20
**Status:** aprovado pelo usuário (2026-08-20 — front + IA consolidada; gráficos preservados em seção "Panorama"; troca do 4º hero; guard needsMunicipio)

## Objetivo

Entregar o módulo 01 do roadmap: reestruturar a página inicial ("Núcleo de
Dados", rota `/app`) como porta de entrada do NID — cenário do município,
mudanças relevantes, riscos/oportunidades da IA e atalhos de aprofundamento —
reorganizando o que já existe e dando à IA da página a leitura consolidada de
todas as bases econômicas.

## Decisões aprovadas

- **Front + IA consolidada:** reorganização da página + reescrita do dataset
  `geral` no `insights_service` (payload compacto de todas as bases, com
  variações YoY onde os dados permitem) e prompt novo. **Sem migração**;
  geração continua manual (POST /insights/gerar, ADMIN_GLOBAL).
- **Nada some:** os 6 gráficos atuais descem intactos para a seção
  "Panorama"; Prioridades, Indicadores Personalizados e Releases mantidos.
  Única substituição visível: o 4º KPI hero ("Crescimento PIB", redundante
  com o delta do card do PIB) vira **VAF · IPM** (delta real disponível).
- **Guard unificado:** a página adota `needsMunicipio` + `SelecioneMunicipio`
  (padrão F3/F4); hoje ADMIN_GLOBAL vê tudo zerado.
- **Mudanças relevantes é client-side** com os deltas reais existentes (PIB,
  VAF, Arrecadação + saldo CAGED como sinal) — expor novos campos de delta
  via HTTP fica fora de escopo.

## Arquitetura — Frontend

### 1. Nova ordem da página (`src/pages/DashboardGeralPage.jsx`, 453 linhas hoje)

1. `NidPageHeader` (título/sub atuais — intocados).
2. `PrioridadesPanel` (intocado).
3. **Seção "Cenário do município"** (h3 padrão `.nid-insights`-style ou o h3
   dos custom cards): os 4 `NidKpiHero` — PIB · Último Ano, Arrecadação
   Total, Saldo CAGED (inalterados) e **VAF · IPM** no lugar de
   "Crescimento PIB" (valor `ipm_ultimo_ano` 4 casas, delta
   `pctDelta(variacao_ipm_percentual)`, badge ano, foot "índice de
   participação", cor A4, spark opcional se `/vaf/resumo` não trouxer série —
   sem spark). Requer adicionar `/vaf/resumo` ao `Promise.all`.
4. **Seção "Mudanças relevantes"**: componente novo `MudancasRelevantes`
   (`src/components/MudancasRelevantes.jsx`) — recebe os resumos já
   buscados pela página (`{ pib, vaf, arrecadacao, caged }`) e renderiza
   linhas compactas ordenadas por |variação| desc: label, valor da variação
   (pill verde/vermelha), descrição curta e link "Ver em X" (padrão do
   PrioridadesPanel). Saldo CAGED entra como sinal (+N/−N vagas, sem
   percentual, ordenado por último). Itens sem dado somem da lista; lista
   vazia → bloco não renderiza. Lógica pura extraída em
   `montarMudancas(resumos)` exportada para teste.
5. **Seção "Riscos & oportunidades"**: strip atual de `NidInsight` derivados
   (regras inalteradas) + `InsightsPanel dataset="geral"` (inalterado no
   front; o conteúdo melhora via backend).
6. **Seção "Aprofundar"**: componente novo `AtalhoCard`
   (`src/components/AtalhoCard.jsx`): `{ titulo, descricao, icone, to,
   planKey }` → `Link` com ícone + título + descrição de uma linha; quando
   `isModuloLocked({ isGlobal, modulos, modulo: planKey })` (via
   `usePlan()`/`PlanContext` + `isModuloLocked` de `navStructure`), aplica o
   teaser (opacity 0.7 + `LockClosedIcon` + title padrão — mesmas strings da
   sidebar). Grid `md:grid-cols-3` com 6 destinos curados:
   - Análise Econômica — `/app/analise-economica` — sem chave
   - Visão do Prefeito — `/app/painel-prefeito` — `painel_prefeito`
   - Benchmark — `/app/benchmark` — `benchmark`
   - Gestão Empresarial — `/app/desenvolvimento-economico/retencao` —
     `desenvolvimento_economico.retencao`
   - Certificações e Premiações —
     `/app/desenvolvimento-economico/premiacoes` —
     `desenvolvimento_economico.premiacoes`
   - IPS · Panorama Socioeconômico — `/app/ips` — `ips`
   (rotas/chaves espelham `NAV_FLAT`; descrições de uma linha em pt-BR.)
7. **Seção "Panorama"**: os 6 `NidPanel` de gráficos atuais, ordem e código
   intocados, sob um h3 "Panorama".
8. Indicadores Personalizados (intocado) e `ReleasesPanel` (intocado).

### 2. DRY e guard

- A página troca `fmtBR`/`moneyDisplay` locais pelos de
  `utils/metricasEconomicas` (o `pctDelta` local fica — formato do
  `NidKpiHero`).
- O normalizador de `arrecadacao` (hoje local ao `PainelPrefeitoPage`, único
  com delta fora do util) **sobe para `metricasEconomicas.js`** (com
  `resumoPath: "/arrecadacao/resumo"`, `planKey: "arrecadacao"`); o Painel
  passa a importá-lo (remove a entrada local; comportamento byte-idêntico,
  suite do Painel é o gate). `ORDEM_ECONOMICA` NÃO muda (arrecadação não
  entra na página de Análise Econômica).
- Guard: `needsMunicipio = isGlobal && viewAsId == null` → early-return com
  `NidPageHeader` + `SelecioneMunicipio`; effect de load com
  `if (needsMunicipio) return;` (padrão F3/F4; o skip atual de
  `/dashboard-cards` para global permanece).

## Arquitetura — Backend (sem migração)

`backend/app/services/insights_service.py`:

- `_fetch_dados` do dataset `geral` (linhas ~494-526) reescrito: payload
  compacto `{ periodo, bases: {...} }` com os números-chave por base,
  reutilizando as MESMAS consultas agregadas que os fetchers/routers já
  fazem (sem novos models): `pib` (último ano, valor, crescimento YoY),
  `arrecadacao` (total 12m e YoY — recorte por período, corrigindo a soma
  da série inteira de hoje), `caged` (saldo/admissões 12m), `vaf` (IPM
  último ano-base + pct), `empresas` (ativas, abertas 12m), `estban`
  (crédito e depósitos do último mês), `comex` (exportado/importado/balança
  12m), `pix` (volume PF/PJ 12m), `bolsa_familia` (beneficiários do último
  mês — corrigindo a soma de estoques sem significado). Base sem dados →
  chave ausente (o prompt instrui a ignorar ausências).
- Prompt novo `_PROMPT_GERAL` (registrado no `_DATASET_PROMPT_MAP` no lugar
  do `_PROMPT_BASE` para `geral`): persona de assessor econômico do
  prefeito; pede exatamente 5 bullets — 1 de cenário, 2 de
  mudanças/tendências, 1 de risco/atenção, 1 de oportunidade — em linguagem
  executiva, citando números do payload, sem inventar dados.
- `DATASET_LABELS["geral"]` inalterado; contrato de saída (JSON array de 5
  strings, max_tokens 900) inalterado.

## Testes

- `metricasEconomicas.test.js`: entrada `arrecadacao` (pick com delta,
  payload nulo) + `ORDEM_ECONOMICA` inalterada.
- `MudancasRelevantes.test.jsx` (jsdom) + unit de `montarMudancas`:
  ordenação por |delta| desc, CAGED como sinal por último, item sem dado
  fora, lista vazia → null, links corretos.
- `AtalhoCard.test.jsx`: renderiza link com rota; bloqueado por plano mostra
  cadeado + title e continua navegável (teaser — o gate real é o
  PlanLockedView da rota destino).
- `DashboardGeralPage`: teste de página (mocks à la F3/F4) — seções na ordem
  nova (h3s), guard needsMunicipio sem fetches, hero do VAF presente.
- Backend `test_insights_geral.py`: fixture sqlite mínima → payload do
  dataset `geral` tem as chaves esperadas por base semeada e omite bases
  vazias; prompt map aponta `geral` → `_PROMPT_GERAL`.
- Invariantes de navegação e teste estático de títulos: intocados (rota,
  chave `geral` e título "Núcleo de Dados" não mudam).
- Suites completas verdes (baselines: back 433, front 286).

## Fora de escopo

- Geração automática/cron de insights e prioridades (continua manual).
- Novos campos de variação nos endpoints `/resumo` (HTTP).
- Mudanças nos 6 gráficos, nos Indicadores Personalizados, no
  PrioridadesPanel e no ReleasesPanel.
- Persistir/servir o payload consolidado fora do fluxo de insights.

## Riscos

- **Payload do prompt maior**: mais bases no dataset `geral` aumentam o
  prompt — mitigado pelo formato compacto (números-chave, sem séries) e pelo
  contrato de 5 bullets inalterado.
- **Troca do 4º hero** é a única mudança visível de conteúdo — registrada e
  aprovada; reversível em 1 bloco.
- **Semântica dos agregados 12m** no payload da IA segue a dos fetchers
  existentes de cada dataset (mesmas janelas usadas nos insights por base).
