# Gestão Empresarial — Agenda do gestor (módulo 14 pleno, sub-frente C) — Design

**Data:** 2026-09-03
**Status:** aprovado pelo usuário (2026-09-03 — lugar: terceira aba "Agenda" na Gestão Empresarial; histórico de status em tabela própria com migração 0041, com linha inicial na criação; janela de 7 dias com seletor 7 · 14 · 30 e blocos completos; agenda só navega (cada item abre o drawer); seções 1–5 aprovadas como apresentadas)

## Contexto

As sub-frentes A (relevância e risco calculados, commits 499e313..5fdb2d1) e
B (descoberta na base RFB, d2e3048..ea62f83) deixaram a Gestão Empresarial
com cadastro, perfil RFB, contatos, visitas, demandas, próxima ação, sinais
de risco e ranking de descoberta. O que o gestor ainda não tem é uma visão
de **trabalho do dia**: quais ações venceram, o que vence nos próximos dias,
quais demandas estão abertas há quanto tempo, quem foi atendido
recentemente e quem está sem contato. O documento do cliente pede isso e
pede também o **histórico de status das demandas**, que hoje não existe
(`demanda_empresa` guarda só o status atual e `atualizado_em`).

Estado da base de produção (set/2026): 859 empresas acompanhadas, 3
visitas, zero contatos, zero demandas e zero próximas ações registradas —
a agenda nasce quase vazia, então os estados vazios são parte do produto,
não um detalhe.

Existe um Calendário em Dados Internos (`CalendarioPage`,
`useCalendarEvents`) que agrega eventos de três fontes; integrar as próximas
ações a ele é follow-up, fora desta spec (outro módulo de plano e não cobre
demandas/contatos).

## Objetivo

Uma aba "Agenda" na Gestão Empresarial com KPIs e seis blocos — ações
vencidas, próximas N dias, sem data marcada, demandas abertas (com dias em
aberto e "status desde"), sem contato há 90 dias ou mais, contatos e visitas
recentes — construída por um endpoint que reaproveita os sinais de risco da
sub-frente A; e um histórico de mudanças de status das demandas, gravado no
backend e visível no drawer.

## Decisões aprovadas

- **Lugar:** terceira aba na `GestaoEmpresarialTab` ("Acompanhadas" ·
  "Descobrir na base RFB" · "Agenda"); mesma rota, permissões e escopo
  (rejeitados: bloco no topo da aba Acompanhadas; virar eventos do
  Calendário de Dados Internos).
- **Histórico:** tabela própria `demanda_status_historico` com migração
  `0041`, linha inicial na criação da demanda e uma linha por mudança de
  status (rejeitados: reusar `acao_audit`; ficar só com `atualizado_em`).
- **Janela:** 7 dias por padrão com seletor 7 · 14 · 30 na tela; blocos
  completos, incluindo contatos recentes e sem contato 90 d+ (rejeitados: 7
  fixo; só ações e demandas).
- **Ações:** a agenda só navega — cada item abre o drawer da empresa, onde
  próxima ação, contatos e status de demanda já são editados (rejeitado:
  "Reagendar" inline).
- **Data de referência:** `hoje_local()` (sub-frente B) em tudo.

## 1. Histórico de status das demandas

### 1.1 Modelo e migração `0041_demanda_status_historico`

Tabela `demanda_status_historico` (modelo `DemandaStatusHistorico` em
`app/models/desenvolvimento_economico.py`, ao lado de `DemandaEmpresa`):

| coluna | tipo | regra |
|---|---|---|
| `id` | Integer PK | |
| `demanda_id` | FK `demanda_empresa.id`, `ondelete="CASCADE"`, index | apagar a demanda apaga o histórico |
| `municipio_id` | FK `municipios.id`, index | tenant, como nas irmãs |
| `de` | String(20), nullable | `NULL` na linha inicial |
| `para` | String(20), not null | `aberta \| em_andamento \| resolvida` |
| `alterado_por` | FK `usuarios.id`, `ondelete="SET NULL"`, nullable | quem mudou |
| `alterado_em` | DateTime(timezone=True), not null | `datetime.now(timezone.utc)` |

Relationship `DemandaEmpresa.historico` (`order_by=alterado_em`,
`cascade="all, delete-orphan"`) e `DemandaStatusHistorico.demanda`.
Migração no estilo de `0038_gestao_empresarial.py` (`create_table` +
índices `ix_..._demanda_id`, `ix_..._municipio_id`, `ix_..._id`;
`downgrade` simétrico). Sem backfill: demandas existentes ficam sem
histórico e a agenda usa `data_registro` como "desde" (regra 2.3).

### 1.2 Gravação

- `POST /retencao/{empresa_id}/demandas` (`adicionar_demanda`): após criar a
  demanda, grava `DemandaStatusHistorico(de=None, para=demanda.status,
  alterado_por=current_user.id)` no mesmo commit.
- `PUT /retencao/demandas/{demanda_id}` (`atualizar_demanda`): se `status`
  veio no payload **e é diferente** do atual, grava
  `(de=status_antigo, para=status_novo, alterado_por=current_user.id)`
  no mesmo commit; sem mudança de status, nada é gravado (editar descrição
  ou responsável não gera linha).
- Helper `registrar_status_demanda(db, demanda, de, para, usuario_id)` no
  router (ou no serviço), usado pelos dois handlers.

### 1.3 Leitura

`DemandaEmpresaOut` ganha `historico: List[DemandaStatusOut] = []` com
`DemandaStatusOut {de: str | None, para: str, alterado_em: datetime,
alterado_por_nome: str | None}` (nome do usuário via relationship;
`None` se o usuário foi apagado). O detalhe da empresa
(`GET /retencao/{id}`) já carrega `demandas` com `selectinload`; passa a
carregar `demandas.historico` e `historico.usuario` junto (sem N+1). Os
handlers `adicionar_demanda`/`atualizar_demanda` devolvem a demanda com o
histórico atualizado (refresh + acesso à relationship).

## 2. Endpoint da agenda

### 2.1 `GET /desenvolvimento-economico/retencao/agenda`

Parâmetros: `dias: int = Query(7)` — aceita só `7`, `14` ou `30` (outro
valor → 422, validado no handler como em `/descobrir`); `municipio_id`
opcional para ADMIN_GLOBAL (view-as), ignorado para os demais — o mesmo
filtro de tenant de `listar_retencao`. ADMIN_GLOBAL sem `municipio_id`
recebe a agenda vazia (`kpis` zerados, listas vazias) — a tela já bloqueia
esse caso com `needsMunicipio`.

Resposta `AgendaOut`:

```json
{
  "hoje": "2026-09-03",
  "dias": 7,
  "kpis": { "vencidas": 2, "proximas": 3, "sem_data": 1, "demandas_abertas": 4, "sem_contato": 12 },
  "vencidas":  [{ "empresa_id": 7, "empresa_nome": "ACME", "proxima_acao": "Ligar", "proxima_acao_data": "2026-08-30", "dias": 4, "responsavel": "Ana" }],
  "proximas":  [{ "empresa_id": 9, "empresa_nome": "Beta", "proxima_acao": "Visita", "proxima_acao_data": "2026-09-05", "dias": 2, "responsavel": null }],
  "sem_data":  [{ "empresa_id": 3, "empresa_nome": "Gama", "proxima_acao": "Enviar proposta", "responsavel": null }],
  "demandas":  [{ "demanda_id": 5, "empresa_id": 7, "empresa_nome": "ACME", "descricao": "Iluminação da via", "status": "em_andamento", "data_registro": "2026-07-20", "dias_em_aberto": 45, "status_desde": "2026-08-10", "responsavel": "Obras", "sinal_30d": true }],
  "sem_contato": [{ "empresa_id": 11, "empresa_nome": "Delta", "desde": "2026-05-02", "dias": 124 }],
  "contatos_recentes": [{ "empresa_id": 7, "empresa_nome": "ACME", "tipo": "contato", "subtipo": "ligacao", "data": "2026-09-01", "responsavel": "Ana", "observacoes": "Retorno sobre alvará" }]
}
```

### 2.2 Serviço `agenda(db, cadastros, hoje, dias) -> Agenda`

Em `app/services/gestao_empresarial.py`, puro a partir dos cadastros já
filtrados por tenant (o router passa a lista, como faz com `enriquecer`):

1. `calc = enriquecer(db, cadastros, hoje=hoje)` — uma leitura para tudo
   que já é sinal:
   - **vencidas**: cadastros com sinal `proxima_acao_vencida`; `dias =
     (hoje − desde).days`; ordem por `dias` decrescente (mais atrasada
     primeiro), depois nome.
   - **sem_contato**: cadastros com sinal `sem_contato_90d`; `desde` do
     sinal (pode ser `None` para cadastro sem `criado_em`); `dias` a partir
     de `desde` ou `None`; ordem por `dias` decrescente.
   - (o sinal `demanda_aberta_30d` da empresa não é usado item a item; ver
     `sinal_30d` no passo 4, que aplica a mesma constante por demanda).
2. **proximas**: `proxima_acao` preenchida e `hoje <= proxima_acao_data <=
   hoje + dias`; `dias = (data − hoje).days` (0 = hoje); ordem por data,
   depois nome.
3. **sem_data**: `proxima_acao` preenchida e `proxima_acao_data` nula;
   ordem por nome.
4. **demandas**: uma consulta `DemandaEmpresa` com `empresa_id IN ids` e
   `status != "resolvida"`, com `selectinload(historico)`; `dias_em_aberto
   = (hoje − data_registro).days`; `status_desde` = `alterado_em.date()` da
   última linha do histórico, ou `data_registro` se não houver histórico;
   `sinal_30d = data_registro <= hoje − DIAS_DEMANDA_ABERTA` (a mesma
   constante do sinal da sub-frente A, aplicada por demanda); ordem por
   `dias_em_aberto` decrescente.
5. **contatos_recentes**: `ContatoEmpresa.data >= hoje − 30` e
   `VisitaRetencao.data_visita >= hoje − 30` para `empresa_id IN ids`,
   mesclados em Python como `{tipo: "contato" | "visita", subtipo: tipo do
   contato ou None, data, responsavel, observacoes}`, ordem por data
   decrescente, limite 50.
6. **kpis**: contagens das listas. Nenhuma lista é limitada, exceto
   `contatos_recentes` (50) — o universo é o número de empresas
   acompanhadas do município (≤ 100 hoje).
7. Lista de cadastros vazia → `Agenda` com tudo vazio, **sem consultar**.

Constante `DIAS_CONTATOS_RECENTES = 30`; janelas válidas
`JANELAS_AGENDA = (7, 14, 30)`. Dataclasses `Agenda`, `ItemAcao`,
`ItemDemanda`, `ItemSemContato`, `ItemContato`; schemas Pydantic
correspondentes (`AgendaOut`, `AgendaKpisOut`, `ItemAcaoOut`,
`ItemDemandaOut`, `ItemSemContatoOut`, `ItemContatoOut`).

### 2.3 Regras de data

Tudo com `hoje = hoje_local()` passado pelo router. `dias` nunca é
negativo em `proximas` (a fronteira `< hoje` é "vencida"; `== hoje` é
"próxima" com `dias = 0`). "Status desde" sem histórico = `data_registro`
(demandas anteriores à migração).

## 3. Frontend

### 3.1 `GestaoEmpresarialTab.jsx`

- `NidTabBar` passa a `["Acompanhadas", "Descobrir na base RFB", "Agenda"]`;
  aba 2 = `<AgendaTab onAbrirEmpresa={abrirPorId} refreshKey={refreshAgenda} />`
  (sem PlanGate: a agenda só usa dados do próprio cadastro).
- `abrirPorId(id)`: encontra a empresa em `empresas` (a lista da aba 0 é
  carregada na montagem, independentemente da aba) e chama `abrirEmpresa`;
  se não encontrar (lista ainda carregando ou desatualizada), chama
  `load()` — que passa a devolver a lista carregada — e procura de novo
  nela; se ainda assim não achar, toast "Empresa não encontrada — atualize
  a página".
- `refreshAgenda`: incrementado junto com `refreshDescoberta` após salvar
  cadastro e também no `onChanged` do drawer (contato/visita/demanda/próxima
  ação alteram a agenda).

### 3.2 `AgendaTab.jsx` (novo)

Props: `onAbrirEmpresa(empresaId)`, `refreshKey`.

- **Seletor de janela**: três botões `nid-tab` "7 dias" · "14 dias" ·
  "30 dias" (como as abas de ano da `IpsPage`; `role="tablist"`,
  `aria-label="Janela da agenda"`, `aria-selected` no ativo); estado local,
  padrão 7; troca refaz a chamada com `dias`.
- **KPIs** (5, grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`, mesmo
  estilo dos KPIs da aba Acompanhadas): Ações vencidas (`text-red-600`) ·
  Próximos N dias · Sem data · Demandas abertas · Sem contato 90 d+.
- **Blocos** (cada um um `NidPanel`-like `section` com `aria-label`): Ações
  vencidas ("{nome} · {ação} · venceu há N dia(s) · {responsável}", tom
  `var(--accent-2)` no atraso) · Próximos N dias ("em N dia(s)" / "hoje") ·
  Sem data marcada · Demandas abertas ("{empresa} · {descrição} ·
  {status} desde dd/mm · N dia(s) em aberto", chip "30 d+" em
  `var(--accent-4)` quando `sinal_30d`) · Sem contato há 90 dias ou mais
  ("desde dd/mm/aaaa · N dias") · Contatos e visitas recentes ("dd/mm ·
  {Ligação|Reunião|E-mail|Visita técnica|Outro|Visita} · {empresa} ·
  {responsável}", observações em uma linha truncada).
- Cada item é `<button type="button">` com `aria-label="Abrir {empresa}"`
  que chama `onAbrirEmpresa(empresa_id)`.
- **Estados**: carregando (`role="status"`); erro `<p role="alert">` "Não
  foi possível carregar a agenda."; bloco vazio mostra sua frase ("Nenhuma
  ação vencida." · "Nada nos próximos N dias." · "Todas as ações têm data."
  · "Nenhuma demanda aberta." · "Todas as empresas tiveram contato nos
  últimos 90 dias." · "Nenhum contato ou visita nos últimos 30 dias."); se
  todas as listas estão vazias, um aviso geral acima dos blocos: "Nada na
  agenda: nenhuma ação, demanda aberta ou contato recente. Registre próximas
  ações e contatos no drawer de cada empresa."
- Respostas superadas (janela mudou antes de chegar) ignoradas por cleanup.

### 3.3 `EmpresaDrawer.jsx` (aba Demandas)

- Ao lado do status de cada demanda: "desde dd/mm/aaaa" (última linha do
  `historico`, ou `data_registro` se vazio).
- Link "ver histórico" (`aria-expanded`) que expande a lista: "dd/mm/aaaa
  hh:mm · aberta → em andamento · {nome}"; linha inicial mostra "criada como
  {status}". Demanda sem histórico mostra "Sem histórico registrado (anterior
  a set/2026)".
- `onChanged` continua sendo chamado após mudar status (já é), o que
  recarrega detalhe, lista e agenda.

### 3.4 Sem mudanças

`DescobrirRfb`, `EmpresasPage`, Calendário de Dados Internos, rotas,
sidebar, chaves de plano, permissões (`retencao.editar` continua exigido
para mudar status).

## 4. Testes

**Backend (pytest, fixture SQLite no estilo de
`test_gestao_empresarial_endpoints.py`, com a tabela nova no
`create_all`):**
- `test_gestao_empresarial_models.py`: `DemandaStatusHistorico` cria e
  apaga em cascata com a demanda; ordem por `alterado_em`.
- `test_gestao_empresarial_endpoints.py`: POST grava linha inicial
  (`de=None, para="aberta"`); PUT com status novo grava transição com
  `alterado_por`; PUT sem mudança de status (ou só descrição) não grava;
  detalhe devolve `historico` com `alterado_por_nome`; agenda: tenant
  (u1 não vê itens de m2; admin com `municipio_id`), `dias=10` → 422,
  admin sem município → vazio.
- `tests/test_gestao_empresarial_agenda.py` (serviço `agenda` sobre
  fixture SQLite, `hoje` fixo): vencidas com `dias` e ordem; fronteiras
  (`proxima_acao_data == hoje` é próxima com `dias 0`; `hoje + dias` entra,
  `hoje + dias + 1` não); sem data; demandas com `dias_em_aberto`,
  `status_desde` com histórico e sem histórico, `sinal_30d` em 29/30 dias,
  resolvidas fora; sem contato via sinal (cadastro novo sem contato não
  entra); contatos e visitas mesclados e ordenados, corte de 30 dias,
  limite 50; lista vazia não consulta (`MagicMock`).
- Migração: `alembic heads` = `0041_demanda_status_historico`; teste de
  `downgrade`/`upgrade` não é gate (sem Postgres local), conferir no deploy.
- Suite completa: baseline **599**.

**Frontend (vitest):**
- `AgendaTab.test.jsx`: KPIs e blocos a partir de um payload completo;
  seletor envia `dias=14`; clique em item chama `onAbrirEmpresa(7)`; vazio
  geral; vazio por bloco; erro (`role="alert"`); `refreshKey` recarrega.
- `GestaoEmpresarialTab.test.jsx`: aba Agenda aparece e carrega
  `/retencao/agenda`; `abrirPorId` abre o drawer da empresa da lista;
  `onChanged` do drawer recarrega a agenda.
- `EmpresaDrawer.test.jsx`: "desde" e "ver histórico" com transições;
  demanda sem histórico.
- Suite completa: baseline **449**.

## Fora de escopo

Reagendar/concluir ações direto na agenda; notificações ou e-mails;
próximas ações no Calendário de Dados Internos; histórico retroativo
(backfill) para demandas antigas; BrasilAPI e importação em lote (D);
mudanças em `EmpresasPage`.

## Riscos e efeitos esperados

- **Migração `0041` no deploy** da api (worker não é afetado). Front novo
  contra api velha: aba Agenda mostra o alerta de erro e o resto funciona;
  drawer mostra "Sem histórico registrado".
- **Agenda quase vazia em produção** hoje: por desenho, os vazios explicam
  o que registrar. Nos municípios demo, "Sem contato 90 d+" lista quase
  todas as empresas (cadastros antigos sem contato) — esperado, mesmo
  comportamento do chip da sub-frente A.
- **Custo**: `enriquecer` (4 consultas em lote) + demandas + contatos +
  visitas por requisição, sobre o número de empresas acompanhadas do
  município (≤ 100 hoje); sem paginação.
- **Concorrência de status**: dois PUTs simultâneos podem gravar duas
  transições com o mesmo `de`; aceito (raro, e o histórico continua
  verdadeiro quanto ao que cada requisição viu).
