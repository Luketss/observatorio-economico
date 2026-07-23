# Projetos: modal com checklist, datas e alerta de atraso — Design

**Data:** 2026-07-23
**Branch alvo:** nova branch a partir de `main`
**Status:** aprovado pelo usuário (2026-07-23)

## Contexto

O acompanhamento de projetos (`/app/projetos`, aba Acompanhamento) tem kanban de 3 status e um
modal de detalhes estreito (520px) que só exibe texto: status, título, descrição, `conteudo`
livre e um rodapé de metadados. Não existe checklist de tarefas, nenhum indicador de progresso
e nenhum sinal de atraso — mesmo com `data_prazo` no modelo. O acompanhamento real acontece
fora da plataforma.

Item 2 do backlog de 2026-07-23. Depende da feature de roles (mergeada): os endpoints de
projetos já usam `require_permissao("projetos", verbo)` e o frontend usa
`usePermissao`/`canCriar`/`canEditar`/`canExcluir`.

## Objetivos

1. **Checklist de tarefas por projeto**: título + prazo opcional + concluída, gerenciado
   direto no modal de detalhes (marcar, adicionar, editar inline, excluir).
2. **Progresso derivado do checklist**: barra "N/M tarefas · X%" no card do kanban e no modal
   (só quando há tarefas).
3. **Alerta de atraso** (`data_prazo` vencida e status ≠ concluído): pill vermelha
   "Atrasado há Nd" no card e no modal, prazo em vermelho na tabela, KPI "Atrasados" no topo,
   e tarefas vencidas não concluídas em vermelho dentro do checklist.
4. **Modal redesenhado**: coluna única ~680px em seções (aprovado em mockup ASCII).

## Não-objetivos (decididos)

- Checklist-padrão nos modelos do Acervo (`ProjetoTemplate`) — o checklist nasce vazio no
  projeto; templates podem ganhar isso depois sem retrabalho.
- Responsável por tarefa e reordenação manual (drag-drop) — tarefa é só título+prazo+feito;
  ordem de exibição é a de criação.
- "Atrasado" persistido no banco ou notificações de atraso — derivado no cliente; sino de
  notificações é outro item do backlog.
- Validação de prazo da tarefa contra prazo do projeto — datas livres.

## Arquitetura escolhida

**Tabela `projeto_tarefa` + endpoints aninhados.** Marcar um check é um PUT pequeno e
atômico (dois usuários não se sobrescrevem) e tarefas ficam consultáveis em SQL no futuro.

Alternativa rejeitada: *coluna JSON em `projetos`* — sem migration de tabela nova, mas
edições concorrentes do array inteiro se sobrescrevem e não há consulta SQL.

## Componentes

### 1. Migration 0034 (`projeto_tarefa`)

```
projeto_tarefa
├─ id          PK
├─ projeto_id  FK projetos.id, ondelete=CASCADE, indexed, NOT NULL
├─ titulo      String(255) NOT NULL
├─ prazo       Date NULL
├─ concluida   Boolean NOT NULL default false
└─ criado_em   DateTime(tz) server_default now()
```

- Modelo `ProjetoTarefa` em `backend/app/models/projeto.py`; `Projeto.tarefas` relationship
  com `cascade="all, delete-orphan"`, ordenada por `id`.
- **Cascade de município**: o delete de município já remove `Projeto`; as tarefas caem pelo
  FK `ondelete=CASCADE`. O plano confere se `municipio_management` deleta projetos via ORM
  bulk delete (que NÃO dispara cascade Python — o FK de banco cobre). O plano também
  confere o clone de município: se ele copia `Projeto`, a cópia das tarefas vira requisito
  do plano; se não copia, nada a fazer.

### 2. Backend — API (`backend/app/api/v1/routers/projetos.py`)

- `ProjetoOut` ganha `tarefas: list[TarefaOut]`; `GET /projetos` usa
  `selectinload(Projeto.tarefas)` (sem N+1).
- `TarefaOut {id, titulo, prazo, concluida}`; `TarefaCreate {titulo, prazo?}`;
  `TarefaUpdate {titulo?, prazo?, concluida?}` (parcial, `exclude_unset`).
- Endpoints, todos `require_permissao("projetos", "editar")` + tenant check do projeto pai
  (mesmo padrão dos endpoints atuais: 404 se projeto não existe; 403 se de outro município
  para não-global):
  - `POST /projetos/{pid}/tarefas` → TarefaOut
  - `PUT /projetos/{pid}/tarefas/{tid}` → TarefaOut (404 se tarefa não pertence ao projeto)
  - `DELETE /projetos/{pid}/tarefas/{tid}` → `{"ok": true}`
- Racional da permissão: tarefa é conteúdo do projeto — criar/editar/excluir tarefa é
  "editar o projeto"; os verbos criar/excluir do projeto continuam valendo só para o
  projeto em si.

### 3. Frontend — helper puro de atraso e progresso

`frontend-observatorio/src/utils/projetoStatus.js` (puro, testado com vitest):

- `diasAtraso(projeto, hoje = new Date())` → `null` se sem `data_prazo`, status
  `concluido`, ou prazo ≥ hoje; senão inteiro ≥ 1 (dias corridos de atraso). Comparação em
  data local (mesmo tratamento `new Date(d + "T00:00:00")` já usado em `fmtDate`).
- `tarefaAtrasada(tarefa, hoje)` → bool (não concluída e `prazo < hoje`, mesma comparação
  local de `diasAtraso`; sem prazo → false).
- `progresso(tarefas)` → `null` se lista vazia; senão `{feitas, total, pct}`.

### 4. Frontend — modal de detalhes redesenhado (`AcompanhamentoTab.jsx` + componente novo)

Modal `nid-modal` com `maxWidth: 680`, coluna única em seções (mockup aprovado):

1. **Cabeçalho**: pills lado a lado — status + "⚠ Atrasado há Nd" (vermelho, via
   `StatusPill` kind danger ou pill própria) — título, e barra de progresso com legenda
   "N/M tarefas · X%" (só quando há tarefas).
2. **Metadados** em grade: eixo, departamento, responsável, início, prazo (prazo em
   vermelho quando atrasado).
3. **Descrição** (como hoje).
4. **Checklist** — componente novo `frontend-observatorio/src/pages/projetos/ChecklistProjeto.jsx`
   (para não inflar o `AcompanhamentoTab.jsx`, que já tem ~700 linhas):
   - Linha por tarefa: checkbox (PUT `concluida`), título, prazo formatado; vencida e não
     concluída → texto/data em vermelho.
   - Com `canEditar`: lápis inline (linha vira inputs de título+data, salva com Enter/botão),
     lixeira com delete direto + toast (sem modal de confirmação — recriar é barato), e no
     rodapé input "+ Nova tarefa" com date opcional (Enter ou botão adiciona).
   - Sem `canEditar`: lista somente leitura, sem controles.
   - Estado vazio: "Nenhuma tarefa ainda." (+ input se `canEditar`).
   - Mutações atualizam o projeto em memória (callback `onChange` re-sincroniza o
     `viewingProjeto` e a lista) sem recarregar a página inteira.
5. **Notas** (`conteudo`, como hoje).

### 5. Frontend — card, tabela e KPIs

- **Card do kanban**: quando atrasado, pill vermelha "Atrasado há Nd" junto à linha do
  prazo; quando há tarefas, mini barra de progresso + "N/M" acima do rodapé.
- **Tabela**: célula de prazo em vermelho com sufixo "· atrasado" quando aplicável.
- **KPI row**: 5º card "Atrasados" (accent vermelho), contado no cliente com `diasAtraso`;
  grid vira `md:grid-cols-5`.

## Erros e permissões

Backend é a fonte de verdade; gating do frontend é UX. 403 sem `projetos/editar`; 404 para
projeto/tarefa inexistente ou tarefa de outro projeto; tenant check idêntico ao dos
endpoints de projeto. Erros exibidos via toast lendo `err.response?.data?.detail` (padrão
do interceptor).

## Testes

- **Backend (pure-logic, sem DB)**: schemas de tarefa (create exige titulo; update parcial
  com `exclude_unset`; datas ISO válidas).
- **Frontend (vitest)**: `projetoStatus.js` — `diasAtraso` (sem prazo, concluído, prazo
  hoje, prazo ontem, N dias), `tarefaAtrasada`, `progresso` (vazia, parcial, completa).
- **Gates**: suite backend, `npx vitest run`, `npm run build`.
- **E2E manual (Railway)**: criar projeto com prazo vencido → pill no card/modal, KPI
  conta; adicionar 3 tarefas (1 com prazo vencido → vermelha), marcar 2 → barra 2/3·66%;
  editar título/prazo inline; excluir tarefa; usuário sem `projetos/editar` vê checklist
  somente leitura.

## Rollout

1. Migration 0034 na Railway (aditiva).
2. Deploy backend (endpoints novos; `ProjetoOut.tarefas` é campo aditivo).
3. Deploy frontend.
