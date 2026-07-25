# Prioridades do mês editáveis — Design

**Data:** 2026-07-25
**Escopo:** backend (área de permissão + 1 endpoint + migration data-only) e frontend (editor compartilhado)
**Contexto:** hoje as prioridades são geradas por IA (`gerar_prioridades`, ADMIN_GLOBAL em /admin/insights)
e exibidas pelo `PrioridadesPanel` no Painel do Prefeito e no Dashboard Geral. Não há edição de conteúdo.

## Decisões de escopo (validadas com o usuário)

1. **ADMIN_MUNICIPIO também edita** (além do ADMIN_GLOBAL) — prioridades passam a ser co-geridas.
2. **Edição inline no painel:** botão de editar no próprio `PrioridadesPanel` (modal), visível só com
   permissão. Vale para Painel do Prefeito e Dashboard Geral (mesmo componente).
3. **Permissão via matriz de roles:** nova área `"prioridades"` (10ª) no sistema de permissões;
   builtin ADMIN_MUNICIPIO ganha por default via migration data-only; roles custom concedem pela matriz.
4. **Editor com 1–3 itens**, cada um: tipo via select (Atenção/Oportunidade/Risco/Sem destaque),
   título, observação, dataset de referência opcional. O tipo vira prefixo do título ao salvar —
   **zero mudança no formato armazenado** (`conteudo` = JSON de `{titulo, observacao, dataset_referencia}`).
5. **IA × manual:** regenerar continua funcionando e sobrescreve; se a versão do mês tiver
   `modelo="especialista"`, o /admin/insights pede confirmação antes de regenerar.
6. **Backend: `PUT /insights/prioridades`** (upsert do mês corrente) — endpoint único para as duas
   personas, espelhando o precedente `inserir_release`.

## Backend

### Área de permissão nova

- `app/core/permissions.py`: `"prioridades"` adicionada a `AREAS` e `AREA_LABELS`
  (label: `"Prioridades do Mês"`). `VERBOS` inalterado; o backend só consulta o verbo `editar`
  para essa área. `permissoes_efetivas`/`PERMISSOES_TODAS` derivam automaticamente (o `/auth/me`
  passa a expor a área sem mudança adicional).
- **Migration 0035 (data-only, zero schema):** no JSON `permissoes` da role builtin
  `ADMIN_MUNICIPIO`, adiciona `"prioridades": ["criar", "editar", "excluir"]` — paridade com
  `PERMISSOES_TODAS`/seed, que derivam todos os verbos por área; o backend consulta apenas
  `editar` (verbos extras são inertes). Downgrade remove a chave. Seed não muda (deriva da
  fonte). Roles custom existentes: sem a área (negado por default).

### `PUT /insights/prioridades`

Request (Pydantic):

```python
class PrioridadeEditItem(BaseModel):
    titulo: str            # min_length=1, max_length=255 (já com prefixo de tipo, se houver)
    observacao: str        # min_length=1, max_length=1000
    dataset_referencia: str | None = None

class SalvarPrioridadesRequest(BaseModel):
    municipio_id: int | None = None      # usado APENAS por ADMIN_GLOBAL
    prioridades: list[PrioridadeEditItem]  # min_length=1, max_length=3
```

Regras:

- ADMIN_GLOBAL: `municipio_id` obrigatório (400 sem) e é o alvo da gravação.
- Usuário comum: exige `tem_permissao(role, "prioridades", "editar")` (403 `PERMISSAO_NEGADA` senão);
  grava **sempre** em `current_user.municipio_id` — o `municipio_id` do body é ignorado
  (anti cross-tenant). Usuário sem município: 400.
- Upsert por `(municipio_id, dataset="prioridades", periodo=UTC "%Y-%m")` via `buscar_insight`:
  - existe → atualiza `conteudo` (JSON dos itens, `ensure_ascii=False`), `modelo="especialista"`,
    `gerado_em=now(UTC)`; `ativo`/`oculto_planos` preservados.
  - não existe → cria com `modelo="especialista"`, `ativo=True` (default do modelo).
- Response: `PrioridadesResponse` existente (via `_to_prioridades_response`).
- `POST /insights/prioridades/gerar` e `GET /insights/prioridades` inalterados.

## Frontend

### `utils/prioridadesForm.js` (novo, puro, vitest)

- `TIPOS_PRIORIDADE`: `["Atenção", "Oportunidade", "Risco"]` (+ ausência = sem destaque).
- `parseTitulo(titulo) => { tipo: string|null, texto: string }` — extrai o prefixo
  (regex atual do `parsePrefix` do painel, que migra para cá).
- `montarTitulo(tipo, texto) => string` — `"Tipo: texto"` ou `texto` puro se tipo null/vazio.
- `validarItens(itens) => string|null` — mensagem de erro ou null: 1–3 itens, título e observação
  não vazios (trim).
- `DATASET_ROUTE` e `DATASET_LABEL` movem do `PrioridadesPanel` para cá (painel e editor importam daqui).

### `components/PrioridadesEditorModal.jsx` (novo)

- Props: `aberto`, `onClose`, `inicial` (PrioridadesResponse | null), `municipioId`
  (null = usuário do município; number = ADMIN_GLOBAL no /admin/insights), `onSaved(data)`.
- Padrão de modal da casa: backdrop com blur, clique fora fecha, Escape fecha, max-w-2xl,
  `max-h-[90vh] overflow-y-auto`.
- Estado: lista de itens `{tipo, texto, observacao, dataset_referencia}` inicializada de
  `inicial.prioridades` via `parseTitulo` (ou 1 item vazio). Adicionar item (máx 3),
  remover (mín 1). Selects de tipo (com opção "Sem destaque") e de dataset
  ("Nenhum" + entradas de `DATASET_LABEL`).
- Salvar: `validarItens` → erro inline se inválido; monta payload com `montarTitulo`;
  `PUT /insights/prioridades` (body inclui `municipio_id` só quando `municipioId` é number);
  sucesso → toast + `onSaved(res.data)` + fecha; erro → mensagem inline com
  `err?.response?.data?.detail || "Erro ao salvar."` (padrão dos forms da casa).

### `PrioridadesPanel`

- `usePermissao("prioridades", "editar")` → `canEditar`.
- Header ganha botão lápis (aria-label "Editar prioridades") quando `canEditar`; abre o modal com
  `inicial=state.data`, `municipioId=null`.
- Empty state (404): quando `canEditar`, além do texto atual, botão "Adicionar prioridades"
  abrindo o modal com `inicial=null`.
- `onSaved(data)` → `setState({ status: "ok", data })`.
- Rótulo do header: `modelo === "especialista"` → "editado em {data}"; senão "gerado em {data}" (atual).
- Estados error/loading inalterados; `parsePrefix` local substituído pelo `parseTitulo` do utils.

### `/admin/insights` (InsightsAdminPage)

- Seção "Prioridades do mês" ganha botão **Editar** ao lado de Gerar/Regenerar (sempre visível com
  município selecionado — permite criar do zero). Abre o mesmo `PrioridadesEditorModal` com
  `inicial=prioridades`, `municipioId=parseInt(selectedId)`; `onSaved` → `setPrioridades(data)`.
- `handleGerarPrioridades`: se `prioridades?.modelo === "especialista"`, `confirm()` antes:
  "Há edição manual deste mês — regenerar substitui o conteúdo pela versão de IA. Continuar?".

### RolesAdminPage (matriz)

- A matriz passa a listar a área "Prioridades do Mês" exibindo **apenas o checkbox de editar**
  (criar/excluir não se aplicam). Implementação: config de verbos por área no frontend
  (default = 3 verbos; prioridades = só editar). A fonte das áreas/labels da página segue o
  padrão atual da RolesAdminPage (lista local sincronizada com o backend).

## Casos de borda

- Usuário de plano free: o GET já filtra `oculto_planos` — sem mudança. A edição não altera
  `oculto_planos`.
- Regenerar em mês NOVO cria linha nova (comportamento atual); a edição manual do mês anterior
  permanece no histórico, e o GET (latest) passa a servir a nova.
- Dois editores simultâneos: last-write-wins no upsert (aceito; mesma semântica do restante).
- `dataset_referencia` fora do mapa de rotas: painel já ignora o link (comportamento atual mantido).

## Testes e gates

- **Backend (puros, RED→GREEN):** área nova em permissions (concedida/negada/bypass global/role
  custom sem a área); schema do PUT (0 itens 422, 4 itens 422, título vazio 422, max_length,
  `dataset_referencia` opcional).
- **Frontend (vitest):** `prioridadesForm` — `parseTitulo` (3 prefixos, sem prefixo, string vazia),
  `montarTitulo` (com/sem tipo), `validarItens` (vazio, >3, título/observação em branco, válido).
  ~10 testes. Suíte atual: 41 → ~51.
- **Gates:** pytest backend exit 0; vitest exit 0; `npm run build` exit 0.
- **E2E API (Railway, pós-implementação):** PUT sem permissão 403; com permissão 200 + GET
  refletindo + `modelo="especialista"`; global com `municipio_id` 200; global sem `municipio_id`
  400; payload inválido 422; regenerar sobrescreve (modelo volta a IA).
- **Checklist visual (usuário):** lápis no painel (só com permissão), editor 1–3 itens com selects,
  salvar reflete na hora com "editado em", empty state com botão para admin municipal, botão
  Editar + confirm de regenerar no /admin/insights, linha só-editar na matriz de roles.

## Fora de escopo

- Histórico/versões de edições; agendamento; notificações de mudança de prioridades;
  edição de `ativo`/`oculto_planos` pelo município; IA sugerindo a partir do texto editado.
