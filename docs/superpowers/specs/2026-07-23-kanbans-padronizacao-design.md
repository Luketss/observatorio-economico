# Kanbans: padronização + oportunidades de emendas na Captação — Design

**Data:** 2026-07-23
**Branch alvo:** nova branch a partir de `main`
**Status:** aprovado pelo usuário (2026-07-23)

## Contexto

Os 4 kanbans (Projetos/AcompanhamentoTab, Captação, Funil, Escrita) divergem em funcionalidades:
só Projetos tem modal de detalhes read-only e view tabela; o Funil não tem select de mover
estágio no card (só via edição) e some com colunas vazias; e a página de Captação não tem
nenhuma lista de oportunidades externas — as emendas só entram via CTA na página de Emendas.

Item 5 do backlog de 2026-07-23, ciclo 1 de 2. **Ciclo 2 (spec separado, na sequência):
drag-and-drop nos 4 kanbans** — decisão do usuário, adiado por exigir lib nova (dnd-kit) e
reescrita das colunas.

## Objetivos

1. **Modal de detalhes read-only** em Captação, Funil e Escrita (título do card clicável —
   padrão Premiações/Projetos), com todos os campos sem truncar.
2. **View tabela** (toggle kanban↔tabela, padrão Projetos) em Captação, Funil e Escrita.
3. **Consistência do Funil**: select de estágio no rodapé do card + box tracejado "Vazio"
   em coluna vazia (hoje `return null`).
4. **Seção "Oportunidades de emendas" na Captação**: tabela estilo ranking (ano, autor,
   tipo, área, empenhado, pago, barra de execução) via `GET /emendas/radar` com seletor de
   ano e botão "+ kanban" por linha (`CriarOportunidadeCaptacao` existente, SEM navegar —
   o card nasce na própria tela e o kanban recarrega). Sem módulo `emendas` no plano:
   teaser com cadeado e texto curto de upgrade.
5. **`BarraExecucao` extraída** para `src/components/nid/BarraExecucao.jsx` (reuso real:
   EmendasPage + CaptacaoTab).

## Não-objetivos (decididos)

- Drag-and-drop — ciclo 2, spec próprio.
- Componente Kanban genérico unificado — rejeitado: os tabs usam idiomas visuais diferentes
  (`nid-*` vs Tailwind puro); unificar agora força restyling sem valor; será natural no DnD.
- Dedup de emendas jogadas 2× pro kanban — paridade com o CTA atual (sem FK emenda↔captação).
- Busca nos kanbans — nenhum tem hoje; fora do escopo.
- Mudanças em Projetos/AcompanhamentoTab — é a referência do padrão.
- Zero backend.

## Componentes

### 1. `BarraExecucao` compartilhada

Mover o componente de `EmendasPage.jsx:15-25` para
`frontend-observatorio/src/components/nid/BarraExecucao.jsx` (mesmo comportamento:
`pct == null` → "—"; barra com verde ≥100%, senão `--accent-1`; label pt-BR).
`EmendasPage` importa do novo caminho.

### 2. `CaptacaoTab.jsx`

- `viewingItem` + modal de detalhes (padrão visual dos modais do arquivo): badge tipo +
  pill estágio, título, entidade_origem, valor_estimado, prazo (destaque `isVencendoEm30`
  se existir no arquivo; senão mesma regra local), link "Ver edital", descrição completa
  (`whitespace-pre-line`). Título do card clicável (`cursor-pointer`); Escape na cadeia
  do `useEscapeKey`.
- Toggle kanban↔tabela (padrão `viewMode` do AcompanhamentoTab, ícones ViewColumns/
  TableCells): colunas Título (clicável → modal), Tipo, Entidade, Valor, Prazo, Estágio
  (pill), Ações (lápis/lixeira por permissão).
- **Seção "Oportunidades de emendas"** abaixo do kanban:
  - Com módulo `emendas` (`canAccess("emendas")` do PlanContext): fetch `GET /emendas/radar`
    (+ `?ano=` do seletor, opções de `radar.anos`); tabela com Ano, Autor, Tipo (curto),
    Área, Empenhado R$, Pago R$, `BarraExecucao(pct_pago)`, e coluna de ação com
    `CriarOportunidadeCaptacao` em modo compact — **com callback de sucesso que recarrega
    o kanban em vez de navegar** (prop nova `onCreated`; quando ausente, mantém o
    `navigate` atual para não quebrar a EmendasPage).
  - `radar.disponivel === false` ou erro: seção não quebra a página (esconde a tabela,
    mantém o título com estado vazio discreto).
  - Sem módulo: card de teaser com cadeado (LockClosedIcon) e texto curto de upgrade,
    sem chamada à API.
- ADMIN_GLOBAL continua bloqueado na página (comportamento atual do tab).

### 3. `FunilTab.jsx`

- Select de estágio no rodapé do card → `handleEstagioChange` (novo, padrão do
  CaptacaoTab: PUT parcial `{estagio}` + toast + reload).
- Coluna vazia: box tracejado "Vazio" (padrão dos outros tabs) em vez de `return null`.
- `viewingItem` + modal de detalhes: empresa, setor, valor_estimado, responsável,
  próxima ação + data, estágio (pill), descrição completa. Título clicável; Escape.
- Toggle kanban↔tabela: Empresa (clicável), Setor, Valor, Responsável, Próxima ação,
  Estágio (pill), Ações. O gráfico `NidFunnel` permanece acima, visível nas duas views.

### 4. `EscritaTab.jsx`

- `viewingItem` + modal de detalhes: título, badge da captação vinculada, resultado
  (pill), responsável, prazo, valor_pleiteado, descrição completa. Título clicável; Escape.
- Toggle kanban↔tabela: Título (clicável), Captação vinculada, Resultado, Responsável,
  Prazo, Valor, Estágio (pill), Ações.

## Erros e permissões

Zero backend; gating existente preservado (permissões por verbo dos kanbans; módulo
`emendas` pelo plano; ADMIN_GLOBAL bloqueado nos tabs). Erros de API nas novas ações lidos
de `err?.response?.data?.detail` com toast, padrão da casa.

## Testes

Sem lógica pura nova. Gates: `npx vitest run` + `npm run build`. Verificação visual do
usuário: 3 modais novos, 3 views de tabela, select/empty do Funil, seção de emendas nos
dois estados de plano (com módulo e teaser) e o "+ kanban" criando card sem sair da tela.
