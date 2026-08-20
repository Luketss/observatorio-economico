# Certificações e Premiações (Fase 4 da reorganização em 5 eixos) — Design

**Data:** 2026-08-20
**Status:** aprovado pelo usuário (2026-08-19/20 — shell com abas navegando entre as 5 URLs existentes; item único na sidebar; guards unificados com view-as de leitura nos 3 GETs)

## Objetivo

Entregar o módulo 16 do roadmap (nome do cliente: **"Certificações e
Premiações"**): fundir Premiações, Captação de Recursos, Escrita de
Projetos, Dinheiro na Mesa e Emendas numa experiência única com abas —
sem quebrar URL, deep link ou chave de plano.

## Decisões aprovadas

- **Shell com abas, URLs mantidas:** as 5 rotas atuais continuam existindo e
  todas renderizam o mesmo shell; a aba ativa deriva da URL e clicar numa
  aba NAVEGA (`useNavigate`). Rejeitados: rota nova com redirects; grupo
  mantido na sidebar (redundância).
- **Item único na sidebar:** "Certificações e Premiações" (TrophyIcon) →
  `/app/desenvolvimento-economico/premiacoes`, chave
  `desenvolvimento_economico.premiacoes`. As outras 4 entradas ganham flag
  nova **`oculto: true`**: o `SidebarNav` as pula, mas o `NAV_FLAT` as
  mantém — teaser de plano por rota (`PlanLockedView` via `currentNav`) e o
  mapa congelado rota→chave ficam intactos.
- **Guards unificados (backend pequeno, zero migração):** as 3 telas CRUD
  (Captação, Escrita, Premiações) trocam o bloqueio total de ADMIN_GLOBAL
  pelo padrão da F3 (`needsMunicipio` + `SelecioneMunicipio`; leitura em
  view-as; escrita bloqueada para global). Os `GET
  /desenvolvimento-economico/captacao|escrita|premiacoes` ganham
  `municipio_id` Query honrado SÓ para ADMIN_GLOBAL — espelho exato do
  `listar_retencao` da F3.

## Arquitetura — Frontend

### 1. Navegação (`navStructure.jsx`)

O grupo "Certificações e Premiações" (5 filhos) é substituído por:

```jsx
{ type: "link", to: "/app/desenvolvimento-economico/premiacoes", label: "Certificações e Premiações", icon: TrophyIcon, modulo: "desenvolvimento_economico.premiacoes" },
{ type: "link", to: "/app/desenvolvimento-economico/captacao", label: "Captação de Recursos", icon: BanknotesIcon, modulo: "desenvolvimento_economico.captacao", oculto: true },
{ type: "link", to: "/app/desenvolvimento-economico/escrita", label: "Escrita de Projetos", icon: PencilSquareIcon, modulo: "desenvolvimento_economico.escrita", oculto: true },
{ type: "link", to: "/app/dinheiro-na-mesa", label: "Dinheiro na Mesa", icon: BanknotesIcon, modulo: "captacao_federal", oculto: true },
{ type: "link", to: "/app/emendas", label: "Emendas", icon: BuildingLibraryIcon, modulo: "emendas", oculto: true },
```

`SidebarNav` filtra `!item.oculto` na renderização (links e filhos de
grupo). Invariantes preservados: NAV_FLAT segue com 32 itens e o
ROTA_MODULO congelado não muda; teste ganha asserções de `oculto`.

### 2. Shell (`src/pages/desenvolvimento-economico/CertificacoesShell.jsx`)

- Config `ABAS = [{ key, label, rota }]` na ordem: Premiações · Captação ·
  Escrita · Dinheiro na Mesa · Emendas.
- Render: `motion.div` padrão (`space-y-6`) → header único (TrophyIcon +
  h1 "Certificações e Premiações" + sub "Oportunidades, captação e
  reconhecimentos do município.") → `NidTabBar` (`value` = key derivada de
  `useLocation().pathname`; `onChange` → `navigate(rota)`) → `{children}`.
- `AppRouter.jsx`: as 5 rotas passam a renderizar
  `<CertificacoesShell><TelaX /></CertificacoesShell>` (rotas e paths
  inalterados).

### 3. As 5 telas viram conteúdo de aba

- `CaptacaoTab`/`EscritaTab`/`PremiacoesTab`: removem o `const header`
  (repetido em 3 branches) e os wrappers `motion.div` próprios (o shell é
  dono de ambos); os returns viram fragmentos/`div className="space-y-6"`.
- `DinheiroNaMesaPage`/`EmendasPage`: removem o `NidPageHeader`; o
  subtítulo específico + `InfoTooltip` (+ `NidSelect` de ano no Emendas)
  viram uma linha compacta no topo do conteúdo (flex, texto
  `text-xs text-[var(--text-dim)]`), eliminando o `marginBottom: 22` do
  header antigo.
- Todo o resto (kanbans, KPIs, drawers, tabelas, gráficos, modais) fica
  byte-idêntico.

### 4. Guards unificados nas 3 CRUD

Padrão F3 em cada uma: `needsMunicipio = isGlobal && viewAsId == null` →
early-return com `SelecioneMunicipio` (dentro do shell); efeito de load
com `if (needsMunicipio) return;`; `canCriar/canEditar/canExcluir` todos
com `&& !isGlobal`. Dinheiro na Mesa e Emendas já seguem o padrão.

## Arquitetura — Backend (sem migração)

`desenvolvimento_economico.py`: `listar_captacao`, `listar_escrita` e
`listar_premiacoes` ganham `municipio_id: int | None = Query(default=None)`
com a mesma lógica do `listar_retencao` da F3 (não-global ignora o param;
global filtra quando informado). Nada mais muda (escrita continua
`require_permissao` + tenant-check inline).

## Testes

- `CertificacoesShell.test.jsx` (jsdom + MemoryRouter): 5 abas na ordem;
  aba ativa derivada da rota inicial; clique navega (rota muda e o
  conteúdo do children re-renderiza); header único presente.
- `navStructure.test.js`: item visível único com label novo; 4 entradas com
  `oculto: true`; NAV_FLAT continua com 32 itens e ROTA_MODULO intocado;
  labels antigos dos filhos continuam existindo (agora ocultos).
- `SidebarNav.test.jsx`: itens ocultos não aparecem na sidebar.
- Guards: teste de página para UMA das 3 CRUD (padrão do
  `GestaoEmpresarialTab.test.jsx`: global sem view-as → SelecioneMunicipio
  sem fetch; com view-as → leitura sem botões de escrita).
- Backend: 3 testes de view-as espelhando `test_listar_view_as_para_global`
  da F3.
- Teste estático de títulos: caso novo do shell ("Certificações e
  Premiações" em `CertificacoesShell.jsx`); os títulos antigos das 5 telas
  deixam de existir nos arquivos delas.
- Suites completas verdes (baselines: back 430, front 278).

## Fora de escopo

- Mudanças de conteúdo interno das telas (kanbans, dados, drawers).
- Chaves de plano, URLs, redirects novos, migrações.
- Fusão de dados entre abas; mover a seção "oportunidades de emendas" da
  Captação (segue onde está).
- Cadeado visual nas abas do shell (o gate por rota via PlanLockedView já
  cobre; refinamento fica para melhoria futura).

## Riscos

- **Ordem de guards no shell:** o guard `needsMunicipio` das telas renderiza
  DENTRO do shell (header + abas visíveis, conteúdo pede view-as) —
  desejável: admin navega entre abas mesmo sem view-as.
- **`NidTabBar` com value por key:** o componente já aceita `value` como
  key (auto-detecção) — sem mudança no componente.
- **Aba ativa em sub-rotas futuras:** derivação por
  `pathname.startsWith(rota)` para não quebrar se uma aba ganhar sub-rota.
