# Execução "todas as fontes" (meta-job) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Rodar todas as fontes" em `/admin/fontes` que encadeia as 10 fontes automáticas em um único job de background (`dataset="todas"`), mantendo os botões individuais.

**Architecture:** Meta-job — um `IngestaoJob` com a key reservada `"todas"` cuja thread itera `ORDEM_EXECUCAO_TODAS` em sequência, com audit/`DatasetInfo` por fonte, isolamento de falhas (fonte que falha vira item "erro" no resumo e a sequência continua) e expansão da captação federal para as UFs dos municípios selecionados. Sem migration, sem endpoint novo, sem mudança na trava global/heartbeat.

**Tech Stack:** FastAPI + SQLAlchemy (sync) no backend; React (Vite) no frontend; pytest puro (sem DB/rede) em `backend/tests`.

**Spec:** `docs/superpowers/specs/2026-07-20-execucao-todas-fontes-design.md`

## Global Constraints

- Branch de trabalho: `feat/captacao-emendas` (a atual).
- `backend/tests` NUNCA abre DB nem rede (decisão de projeto) — só lógica pura.
- Suite backend (do diretório `backend/`, Git Bash): `../venv/Scripts/python.exe -m pytest tests -q`. **O gate é o exit code 0** — o resumo "N passed" do pytest é engolido nesta máquina. Não rodar junto com `tests/` da raiz (coleta combinada colide).
- Gate do frontend: `cd frontend-observatorio && npm run build` (exit 0). O eslint tem falsos-positivos endêmicos ("motion unused", set-state-in-effect) — não são gate.
- `backend/.env` aponta para o Postgres da RAILWAY (banco de dev real). NÃO rodar alembic (não há migration) nem scripts ad-hoc contra ele.
- Commits: conventional commits em pt-BR (ex.: `feat(ingestao): ...`), com trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Nada de f-string sem necessidade / imports não usados — o código segue o estilo dos módulos vizinhos (docstrings pt-BR explicando o "porquê").

---

### Task 1: Ordem de execução + key reservada (`base.py`)

**Files:**
- Modify: `backend/app/services/ingestao_automatica/base.py`
- Test: `backend/tests/test_ingestao_todas.py` (novo)

**Interfaces:**
- Consumes: `FONTES_AUTOMATICAS` (registry existente em `base.py`).
- Produces: `DATASET_TODAS: str = "todas"` e `ORDEM_EXECUCAO_TODAS: list[str]` em `app.services.ingestao_automatica.base` — Tasks 2 e 3 importam ambos.

- [ ] **Step 1: Write the failing tests**

Criar `backend/tests/test_ingestao_todas.py`:

```python
"""Execução 'todas as fontes' (meta-job) — lógica pura, sem DB/rede."""
from app.services.ingestao_automatica import FONTES_AUTOMATICAS  # noqa: F401 — importa o pacote e registra as fontes
from app.services.ingestao_automatica.base import DATASET_TODAS, ORDEM_EXECUCAO_TODAS


def test_ordem_comeca_por_populacao():
    # coeficiente estimado do FPM depende de população já carregada
    assert ORDEM_EXECUCAO_TODAS[0] == "populacao"


def test_ordem_cobre_o_registry_sem_sobras_nem_faltas():
    # quebra se alguém registrar fonte nova e esquecer de incluí-la na ordem
    assert set(ORDEM_EXECUCAO_TODAS) == set(FONTES_AUTOMATICAS)
    assert len(ORDEM_EXECUCAO_TODAS) == len(set(ORDEM_EXECUCAO_TODAS))


def test_captacao_e_emendas_por_ultimo():
    # as duas mais lentas fecham a fila — o grosso dos dados aparece cedo
    assert ORDEM_EXECUCAO_TODAS[-2:] == ["captacao_federal", "emendas"]


def test_key_todas_e_reservada():
    assert DATASET_TODAS == "todas"
    assert DATASET_TODAS not in FONTES_AUTOMATICAS
```

- [ ] **Step 2: Run tests to verify they fail**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests/test_ingestao_todas.py -q`
Expected: FAIL — `ImportError: cannot import name 'DATASET_TODAS'`.

- [ ] **Step 3: Write minimal implementation**

Em `backend/app/services/ingestao_automatica/base.py`, adicionar ao final do arquivo (depois de `registrar`):

```python
# Key sintética do meta-job que encadeia todas as fontes em um único job.
# Reservada: nunca pode ser registrada como fonte real (teste garante).
DATASET_TODAS = "todas"

# Ordem do meta-job: populacao primeiro (o coeficiente estimado do FPM depende
# de população); captacao_federal e emendas por último (as mais lentas — o
# grosso dos dados aparece cedo). Teste garante paridade com FONTES_AUTOMATICAS.
ORDEM_EXECUCAO_TODAS = [
    "populacao",
    "fpm",
    "pib",
    "pix",
    "comex",
    "estban",
    "bolsa_familia",
    "pe_de_meia",
    "captacao_federal",
    "emendas",
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests/test_ingestao_todas.py -q`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/base.py backend/tests/test_ingestao_todas.py
git commit -m "feat(ingestao): ordem de execucao e key reservada do meta-job 'todas'"
```

---

### Task 2: Helpers puros do meta-job (`todas.py`)

**Files:**
- Create: `backend/app/services/ingestao_automatica/todas.py`
- Test: `backend/tests/test_ingestao_todas.py` (acrescentar)

**Interfaces:**
- Consumes: `ResumoIngestao` (dataclass de `base.py`: campos `dataset, municipios_ok, municipios_erro, linhas, notificacoes, erros`).
- Produces (em `app.services.ingestao_automatica.todas`, todos usados pela Task 3):
  - `precisa_expandir_captacao(fonte_key: str, filtros: dict | None) -> bool`
  - `prefixo_etapa(indice: int, total: int, label: str, etapa: str | None) -> str`
  - `item_resumo_ok(key: str, resumo: ResumoIngestao) -> dict`
  - `item_resumo_erro(key: str, exc: Exception) -> dict`
  - `status_final_todas(itens: list[dict]) -> str`  (`"concluido"` | `"erro"`)
  - `mensagem_erro_todas(itens: list[dict]) -> str`
  - Formato do item: `{"key", "status": "ok"|"aviso"|"erro", "linhas", "municipios_ok", "municipios_erro", "erros": list[str]}` — o frontend (Task 4) lê `resumo.fontes` com este shape.

- [ ] **Step 1: Write the failing tests**

Acrescentar ao final de `backend/tests/test_ingestao_todas.py`:

```python
from app.services.ingestao_automatica.base import ResumoIngestao
from app.services.ingestao_automatica.todas import (
    item_resumo_erro,
    item_resumo_ok,
    mensagem_erro_todas,
    precisa_expandir_captacao,
    prefixo_etapa,
    status_final_todas,
)


def _resumo(linhas=10, ok=3, erro=0, erros=None):
    return ResumoIngestao(dataset="pib", municipios_ok=ok, municipios_erro=erro,
                          linhas=linhas, erros=erros or [])


# --- precisa_expandir_captacao -------------------------------------------

def test_captacao_com_municipios_avulsos_expande():
    assert precisa_expandir_captacao("captacao_federal", {"municipio_ids": [1, 2]}) is True


def test_captacao_por_uf_ou_brasil_nao_expande():
    assert precisa_expandir_captacao("captacao_federal", {"estado": "MG"}) is False
    assert precisa_expandir_captacao("captacao_federal", {}) is False
    assert precisa_expandir_captacao("captacao_federal", None) is False


def test_outras_fontes_nunca_expandem():
    assert precisa_expandir_captacao("emendas", {"municipio_ids": [1]}) is False


# --- prefixo_etapa --------------------------------------------------------

def test_prefixo_etapa_com_e_sem_detalhe():
    assert prefixo_etapa(3, 10, "PIB (IBGE)", "baixando ano 2021") == \
        "3/10 · PIB (IBGE) — baixando ano 2021"
    assert prefixo_etapa(3, 10, "PIB (IBGE)", None) == "3/10 · PIB (IBGE)"


# --- itens do resumo agregado --------------------------------------------

def test_item_ok_sem_erros():
    item = item_resumo_ok("pib", _resumo(linhas=42, ok=3))
    assert item == {"key": "pib", "status": "ok", "linhas": 42,
                    "municipios_ok": 3, "municipios_erro": 0, "erros": []}


def test_item_ok_com_erros_parciais_vira_aviso_e_trunca_a_5():
    erros = [f"municipio {i} falhou" for i in range(8)]
    item = item_resumo_ok("fpm", _resumo(erro=8, erros=erros))
    assert item["status"] == "aviso"
    assert item["erros"] == erros[:5]


def test_item_erro_de_excecao():
    item = item_resumo_erro("comex", RuntimeError("x" * 500))
    assert item["status"] == "erro"
    assert item["linhas"] == 0 and item["municipios_ok"] == 0
    assert len(item["erros"]) == 1 and len(item["erros"][0]) == 300


# --- status final e mensagem de erro -------------------------------------

def test_status_final_concluido_se_alguma_fonte_passou():
    itens = [{"status": "erro"}, {"status": "aviso"}, {"status": "erro"}]
    assert status_final_todas(itens) == "concluido"
    assert status_final_todas([{"status": "ok"}]) == "concluido"


def test_status_final_erro_so_se_todas_falharem():
    assert status_final_todas([{"status": "erro"}, {"status": "erro"}]) == "erro"


def test_mensagem_erro_cita_total_e_primeira_falha():
    itens = [
        {"key": "populacao", "status": "erro", "erros": ["IBGE fora do ar"]},
        {"key": "fpm", "status": "erro", "erros": ["timeout"]},
    ]
    msg = mensagem_erro_todas(itens)
    assert "2 fontes" in msg and "IBGE fora do ar" in msg
```

- [ ] **Step 2: Run tests to verify they fail**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests/test_ingestao_todas.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ingestao_automatica.todas'`.

- [ ] **Step 3: Write minimal implementation**

Criar `backend/app/services/ingestao_automatica/todas.py`:

```python
"""Lógica pura do meta-job 'todas as fontes' — decisões testáveis sem DB.

O loop de execução em si vive no runner (precisa de sessões/queries); aqui
ficam o formato do resumo agregado, a regra do status final, o prefixo de
etapa e a decisão de expansão da captação federal."""
from app.services.ingestao_automatica.base import ResumoIngestao


def precisa_expandir_captacao(fonte_key: str, filtros: dict | None) -> bool:
    """Na execução 'todas' com municípios avulsos, a captação federal roda
    para as UFs inteiras da seleção — o diagnóstico compara pares por UF e
    rodar só o município deixaria os pares vazios."""
    return fonte_key == "captacao_federal" and bool((filtros or {}).get("municipio_ids"))


def prefixo_etapa(indice: int, total: int, label: str, etapa: str | None) -> str:
    """Etapa exibida no meta-job: '3/10 · PIB (IBGE) — baixando ano 2021'."""
    base = f"{indice}/{total} · {label}"
    return f"{base} — {etapa}" if etapa else base


def item_resumo_ok(key: str, resumo: ResumoIngestao) -> dict:
    return {
        "key": key,
        "status": "aviso" if resumo.erros else "ok",
        "linhas": resumo.linhas,
        "municipios_ok": resumo.municipios_ok,
        "municipios_erro": resumo.municipios_erro,
        "erros": resumo.erros[:5],
    }


def item_resumo_erro(key: str, exc: Exception) -> dict:
    return {
        "key": key,
        "status": "erro",
        "linhas": 0,
        "municipios_ok": 0,
        "municipios_erro": 0,
        "erros": [str(exc)[:300]],
    }


def status_final_todas(itens: list[dict]) -> str:
    """'concluido' se ao menos uma fonte terminou sem exceção; 'erro' só se
    todas falharem (a lista nunca é vazia — a ordem tem sempre as 10 fontes)."""
    return "concluido" if any(i["status"] != "erro" for i in itens) else "erro"


def mensagem_erro_todas(itens: list[dict]) -> str:
    primeira = next(
        (i["erros"][0] for i in itens if i["status"] == "erro" and i.get("erros")), ""
    )
    return f"Todas as {len(itens)} fontes falharam — primeira falha: {primeira}"[:1000]
```

- [ ] **Step 4: Run tests to verify they pass**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests/test_ingestao_todas.py -q`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/todas.py backend/tests/test_ingestao_todas.py
git commit -m "feat(ingestao): helpers puros do meta-job (resumo agregado, status final, expansao da captacao)"
```

---

### Task 3: Runner — aceitar `"todas"` e executar a sequência

**Files:**
- Modify: `backend/app/services/ingestao_automatica/runner.py`
- Test: regressão — suite `backend/tests` inteira (as lógicas de decisão já estão cobertas nas Tasks 1–2; `_executar_sequencia_todas`/`_municipios_da_fonte` tocam DB e seguem o padrão do projeto: sem teste unitário, validação no E2E manual da Task 5).

**Interfaces:**
- Consumes: `DATASET_TODAS`, `ORDEM_EXECUCAO_TODAS` (Task 1); todos os helpers de `todas.py` (Task 2); `resolver_municipios`, `_atualizar_dataset_info`, `record_ingestao_audit` (existentes).
- Produces: `POST /ingestao-automatica/todas/executar` passa a funcionar (a rota `/{dataset_key}/executar` já casa com `"todas"`; nenhuma mudança no router). Job com `dataset="todas"` termina com `resumo = {"fontes": [item, ...]}` — shape consumido pelo frontend na Task 4.

- [ ] **Step 1: Atualizar imports do runner**

Em `backend/app/services/ingestao_automatica/runner.py`, trocar a linha
`from app.services.ingestao_automatica.base import FONTES_AUTOMATICAS` por:

```python
from app.services.ingestao_automatica.base import (
    DATASET_TODAS,
    FONTES_AUTOMATICAS,
    ORDEM_EXECUCAO_TODAS,
)
from app.services.ingestao_automatica.todas import (
    item_resumo_erro,
    item_resumo_ok,
    mensagem_erro_todas,
    precisa_expandir_captacao,
    prefixo_etapa,
    status_final_todas,
)
```

- [ ] **Step 2: `iniciar_job` aceita a key reservada**

Ainda em `runner.py`, dentro de `iniciar_job`, trocar:

```python
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")
```

por:

```python
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None and dataset_key != DATASET_TODAS:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")
```

(Validação de municípios vazios, advisory lock, 409 e criação do job: inalterados.)

- [ ] **Step 3: Adicionar `_municipios_da_fonte` e `_executar_sequencia_todas`**

Adicionar em `runner.py`, logo depois de `_atualizar_dataset_info`:

```python
def _municipios_da_fonte(db, fonte_key: str, filtros: dict):
    """Municípios que a fonte recebe dentro do meta-job: a captação federal
    expande municípios avulsos para as UFs inteiras da seleção (pares do
    diagnóstico — pode ser mais de uma UF); as demais usam o filtro original."""
    from app.models.municipio import Municipio

    if not precisa_expandir_captacao(fonte_key, filtros):
        return resolver_municipios(db, filtros)
    ufs = [
        uf
        for (uf,) in db.query(Municipio.estado)
        .filter(Municipio.id.in_(filtros["municipio_ids"]))
        .distinct()
    ]
    return (
        db.query(Municipio)
        .filter(Municipio.ativo.is_(True), Municipio.estado.in_(ufs))
        .all()
    )


def _executar_sequencia_todas(db, filtros: dict, usuario_id, progresso) -> list[dict]:
    """Executa as fontes na ordem, isolando falhas: exceção em uma fonte vira
    item 'erro' no resumo agregado e a sequência continua. Audit e DatasetInfo
    são gravados por fonte, exatamente como numa execução individual — o
    'última execução' de cada card e a trilha por dataset continuam corretos."""
    from app.services.municipio_management import record_ingestao_audit

    itens = []
    total_fontes = len(ORDEM_EXECUCAO_TODAS)
    for i, key in enumerate(ORDEM_EXECUCAO_TODAS, start=1):
        fonte = FONTES_AUTOMATICAS[key]

        # default no argumento congela o par (i, label) desta iteração — sem
        # ele, todas as closures veriam a última fonte do loop
        def cb(atual, total=None, etapa=None, _i=i, _label=fonte.label):
            progresso(atual, total, prefixo_etapa(_i, total_fontes, _label, etapa))

        try:
            municipios = _municipios_da_fonte(db, key, filtros)
            cb(0, len(municipios))  # zera a barra e anuncia a fonte corrente
            resumo = fonte.executar(
                db=db,
                municipios=municipios,
                anos=filtros.get("anos"),
                usuario_id=usuario_id,
                notificar=filtros.get("notificar", True),
                progresso=cb,
            )
            record_ingestao_audit(
                db,
                municipio_id=municipios[0].id if len(municipios) == 1 else None,
                usuario_id=usuario_id,
                dataset=key,
                acao="auto_ingest",
                num_linhas=resumo.linhas,
                status="ok" if not resumo.erros else "aviso",
                detalhe="; ".join(resumo.erros[:20]) or None,
            )
            _atualizar_dataset_info(db, key, fonte.label, fonte.fonte)
            itens.append(item_resumo_ok(key, resumo))
        except Exception as exc:  # noqa: BLE001 — uma fonte não derruba a sequência
            logger.exception("Meta-job: fonte %s falhou", key)
            db.rollback()
            record_ingestao_audit(
                db,
                municipio_id=None,
                usuario_id=usuario_id,
                dataset=key,
                acao="auto_ingest",
                num_linhas=0,
                status="erro",
                detalhe=str(exc)[:1000],
            )
            itens.append(item_resumo_erro(key, exc))
    return itens
```

- [ ] **Step 4: Ramificar `_executar_job`**

Em `_executar_job`, o trecho atual entre a definição do callback `progresso` e o
bloco `db_job.refresh(job)` é este:

```python
        resumo = fonte.executar(
            db=db, municipios=municipios, anos=filtros.get("anos"),
            usuario_id=job.usuario_id, notificar=filtros.get("notificar", True),
            progresso=progresso,
        )

        record_ingestao_audit(
            db,
            municipio_id=municipios[0].id if len(municipios) == 1 else None,
            usuario_id=job.usuario_id,
            dataset=job.dataset,
            acao="auto_ingest",
            num_linhas=resumo.linhas,
            status="ok" if not resumo.erros else "aviso",
            detalhe="; ".join(resumo.erros[:20]) or None,
        )
        _atualizar_dataset_info(db, job.dataset, fonte.label, fonte.fonte)
```

Substituir por (audit/DatasetInfo do meta-job acontecem POR FONTE dentro da
sequência — não gravar um audit agregado com dataset "todas"):

```python
        if job.dataset == DATASET_TODAS:
            itens = _executar_sequencia_todas(db, filtros, job.usuario_id, progresso)
            resumo_json = {"fontes": itens}
            status_final = status_final_todas(itens)
            erro_final = mensagem_erro_todas(itens) if status_final == "erro" else None
        else:
            resumo = fonte.executar(
                db=db, municipios=municipios, anos=filtros.get("anos"),
                usuario_id=job.usuario_id, notificar=filtros.get("notificar", True),
                progresso=progresso,
            )
            record_ingestao_audit(
                db,
                municipio_id=municipios[0].id if len(municipios) == 1 else None,
                usuario_id=job.usuario_id,
                dataset=job.dataset,
                acao="auto_ingest",
                num_linhas=resumo.linhas,
                status="ok" if not resumo.erros else "aviso",
                detalhe="; ".join(resumo.erros[:20]) or None,
            )
            _atualizar_dataset_info(db, job.dataset, fonte.label, fonte.fonte)
            resumo_json = asdict(resumo)
            status_final = "concluido"
            erro_final = None
```

Duas mudanças de apoio no mesmo método:

1. A linha `fonte = FONTES_AUTOMATICAS[job.dataset]` (antes de `filtros = ...`)
   vira lookup tolerante — o meta-job não tem entrada no registry:

```python
        fonte = FONTES_AUTOMATICAS.get(job.dataset)  # None quando dataset == DATASET_TODAS
        filtros = job.filtros or {}
```

2. O bloco de finalização logo abaixo passa a usar `status_final`/`resumo_json`/`erro_final`:

```python
        db_job.refresh(job)
        if job.status == "executando":
            job.status = status_final
            job.resumo = resumo_json
            job.erro = erro_final
            job.progresso_atual = job.progresso_total or job.progresso_atual
            job.finalizado_em = _agora()
            job.atualizado_em = _agora()
            db_job.commit()
        else:
            logger.warning(
                "Job %s foi marcado %s externamente; resultado descartado do status",
                job_id, job.status,
            )
```

O handler de exceção externo (`except Exception as exc:`) permanece como está —
uma falha catastrófica da própria sequência (ex.: DB fora) ainda registra audit
com `dataset=job.dataset` ("todas") e marca o job `erro`, o que é aceitável como
trilha do desastre.

- [ ] **Step 5: Rodar a suite inteira (regressão)**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests -q; echo "exit: $?"`
Expected: `exit: 0` (os testes existentes de runner/fontes continuam passando; os novos de Tasks 1–2 também).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ingestao_automatica/runner.py
git commit -m "feat(ingestao): meta-job 'todas' encadeia as 10 fontes com isolamento de falha e captacao por UF"
```

---

### Task 4: Frontend — botão, card de progresso, rótulos, toast e histórico

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx`

**Interfaces:**
- Consumes: `POST /ingestao-automatica/todas/executar` (Task 3); shape `resumo.fontes = [{key, status, linhas, ...}]` (Task 2); estados/handlers existentes da página (`handleExecutar`, `jobAtivo`, `municipiosSel`, `estadoFiltro`).
- Produces: UI final — nenhuma task depende desta.

- [ ] **Step 1: Constantes e helpers**

Logo após a função `duracao(job)` (antes do componente), adicionar:

```jsx
const DATASET_TODAS = "todas";

const labelDataset = (key) => (key === DATASET_TODAS ? "Todas as fontes" : key);

/** Agrega o resumo do meta-job ({fontes: [...]}) para toast e histórico. */
function resumoTodas(resumo) {
  const fontes = resumo?.fontes || [];
  const comErro = fontes.filter((f) => f.status === "erro");
  return {
    fontes,
    ok: fontes.length - comErro.length,
    erro: comErro.length,
    keysErro: comErro.map((f) => f.key),
    linhas: fontes.reduce((s, f) => s + (f.linhas || 0), 0),
  };
}
```

- [ ] **Step 2: Toast final com ramo do meta-job**

Em `startPolling`, trocar o bloco `if (data.status === "concluido") { ... } else { ... }` por:

```jsx
          if (data.status === "concluido" && data.dataset === DATASET_TODAS) {
            const { ok, erro, keysErro } = resumoTodas(data.resumo);
            addToast(
              `Todas as fontes: ${ok} ok` +
                (erro ? `, ${erro} com erro (${keysErro.slice(0, 3).join(", ")})` : ""),
              erro ? "warning" : "success"
            );
          } else if (data.status === "concluido") {
            const r = data.resumo || {};
            addToast(
              `${data.dataset}: ${r.municipios_ok ?? 0} município(s), ${r.linhas ?? 0} linha(s)` +
                (r.notificacoes ? `, ${r.notificacoes} notificação(ões)` : "") +
                (r.municipios_erro ? ` — ${r.municipios_erro} com erro` : ""),
              r.municipios_erro ? "warning" : "success"
            );
          } else {
            addToast(
              `${labelDataset(data.dataset)}: ${labelStatus(data.status)} — ${data.erro || "sem detalhe"}`,
              "error"
            );
          }
```

(Atenção: o `const r = data.resumo || {};` que existia antes do `if` sobe para dentro do ramo individual, como mostrado.)

- [ ] **Step 3: Handler do botão "Rodar todas"**

Logo após `handleExecutar`, adicionar:

```jsx
  const handleExecutarTodas = async () => {
    if (
      !municipiosSel.length && !estadoFiltro &&
      !confirm("Sem filtro, todas as fontes rodarão para o Brasil inteiro — pode levar horas. Continuar?")
    ) {
      return;
    }
    await handleExecutar({ key: DATASET_TODAS, label: "Todas as fontes" });
  };
```

(`handleExecutar` já monta o body com os filtros da tela e inicia o polling — o pseudo-`fonte` só fornece `key` e `label`.)

- [ ] **Step 4: Botão + nota da captação no cabeçalho do painel**

Trocar o bloco do cabeçalho (o `<div>` que contém o `<h2>Fontes automáticas</h2>`, o parágrafo descritivo e o aviso âmbar) por uma linha flex com o botão à direita:

```jsx
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Fontes automáticas</h2>
                <p className="text-sm text-[var(--text-mute)]">
                  Buscam dados direto das APIs públicas — sem CSV. A execução roda em segundo
                  plano; acompanhe o progresso aqui e no histórico abaixo.
                </p>
                {estadoFiltro === "" && municipiosSel.length === 0 && (
                  <p className="text-xs mt-1 text-amber-500">
                    Sem filtro, a execução cobre todos os municípios do Brasil e pode levar muito tempo.
                  </p>
                )}
              </div>
              <div className="space-y-1 max-w-[260px]">
                <button
                  onClick={handleExecutarTodas}
                  disabled={jobAtivo}
                  className="px-4 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                  aria-label="Rodar todas as fontes agora"
                >
                  {jobAtivo && job.dataset === DATASET_TODAS ? "Executando…" : "Rodar todas as fontes"}
                </button>
                <p className="text-xs text-[var(--text-dim)]">
                  A captação federal roda para a UF inteira dos municípios selecionados
                  (comparação de pares).
                </p>
              </div>
            </div>
```

- [ ] **Step 5: Card de progresso do meta-job**

Imediatamente antes do `<div className="space-y-2">` que lista `autoFontes.map(...)`, adicionar:

```jsx
          {jobAtivo && job.dataset === DATASET_TODAS && (
            <div className="rounded-xl border border-teal-600/40 px-4 py-3 space-y-1">
              <p className="font-semibold text-[var(--text)]">Todas as fontes</p>
              <div className="flex justify-between text-xs text-[var(--text-dim)]">
                <span>{job.etapa || labelStatus(job.status)}</span>
                <span>
                  {job.progresso_total
                    ? `${job.progresso_atual}/${job.progresso_total} municípios`
                    : "iniciando…"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--panel-2)] overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all"
                  style={{
                    width: job.progresso_total
                      ? `${Math.min(100, (100 * job.progresso_atual) / job.progresso_total)}%`
                      : "5%",
                  }}
                />
              </div>
            </div>
          )}
```

(A barra reinicia a cada fonte; o prefixo "N/10 · Fonte" na etapa dá o contexto geral — comportamento definido no spec.)

- [ ] **Step 6: Histórico — rótulo, linhas somadas e detalhe agregado**

Na tabela do histórico:

1. Célula da fonte: trocar `{j.dataset}` por `{labelDataset(j.dataset)}`.
2. Célula "Linhas": trocar `{j.resumo?.linhas ?? "—"}` por:

```jsx
                        {j.dataset === DATASET_TODAS
                          ? (j.resumo?.fontes ? resumoTodas(j.resumo).linhas : "—")
                          : (j.resumo?.linhas ?? "—")}
```

3. Célula "Detalhe": trocar o conteúdo atual por:

```jsx
                        {j.dataset === DATASET_TODAS && j.resumo?.fontes
                          ? `${resumoTodas(j.resumo).ok} ok, ${resumoTodas(j.resumo).erro} com erro` +
                            (resumoTodas(j.resumo).erro
                              ? ` (${resumoTodas(j.resumo).keysErro.slice(0, 3).join(", ")})`
                              : "")
                          : j.erro
                            ? j.erro.slice(0, 120)
                            : (j.resumo?.erros || []).slice(0, 2).join("; ").slice(0, 120) || "—"}
```

(Meta-job `abortado`/`erro` sem resumo cai no fallback existente de `j.erro`.)

- [ ] **Step 7: Build (gate)**

Run: `cd frontend-observatorio && npm run build`
Expected: exit 0 (warnings de eslint "motion unused"/set-state-in-effect são falsos-positivos conhecidos, não são gate).

- [ ] **Step 8: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(admin/fontes): botao 'Rodar todas as fontes' com progresso, toast e historico agregados"
```

---

### Task 5: Documentação + verificação final

**Files:**
- Modify: `README.md` (linha ~620: tabela de endpoints; seção "Fluxo em background (jobs)", ~linha 317)
- Modify: `IDEAS.md` (seção Demo Express, ~linha 247)

**Interfaces:**
- Consumes: comportamento entregue nas Tasks 1–4.
- Produces: docs atualizados; verificação final da suite.

- [ ] **Step 1: README — tabela de endpoints**

Na linha do endpoint `POST /api/v1/ingestao-automatica/{key}/executar` (~620), acrescentar ao final da descrição (antes do fecha-célula):

```
; `key="todas"` chains all ten sources sequentially in one job (captação expands to the full UF(s) of the selected municípios)
```

- [ ] **Step 2: README — seção "Fluxo em background (jobs)"**

Adicionar um bullet à lista da seção (após o bullet **Heartbeat / abortado**):

```markdown
- **Meta-job "todas"** — `POST /ingestao-automatica/todas/executar` runs the ten
  sources sequentially inside a single job (order: `populacao` first,
  `captacao_federal`/`emendas` last). A failing source is recorded in its own
  audit row and the sequence continues — the job only ends `erro` if every
  source fails. The final `resumo` becomes
  `{"fontes": [{key, status: ok|aviso|erro, linhas, ...}]}`, and per-source
  audits keep each card's "última execução" accurate.
```

- [ ] **Step 3: IDEAS.md — Demo Express**

Na lista "**O que já existe (jul/2026)**" (~linha 247), adicionar um bullet:

```markdown
- **Execução one-click de todas as fontes** (jul/2026): meta-job `dataset="todas"` encadeia as 10 fontes na ordem certa (população primeiro; captação/emendas por último), com isolamento de falha por fonte e captação expandida para a UF dos municípios selecionados
```

- [ ] **Step 4: Verificação final (suites + build)**

Run (de `backend/`): `../venv/Scripts/python.exe -m pytest tests -q; echo "exit: $?"` → Expected: `exit: 0`
Run: `cd frontend-observatorio && npm run build` → Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add README.md IDEAS.md
git commit -m "docs: execucao 'todas as fontes' (meta-job) no fluxo de jobs e no Demo Express"
```

- [ ] **Step 6: E2E manual (usuário, contra a Railway)**

Não automatizável (decisão de projeto: testes nunca abrem DB/rede). Roteiro para o usuário validar na UI `/admin/fontes`:

1. Selecionar 1 município pequeno (ex.: Itanhandu — MG) + anos recentes (ex.: `2024, 2025`).
2. Clicar **Rodar todas as fontes** → card "Todas as fontes" aparece com etapa `1/10 · População (IBGE)...` e a barra reiniciando a cada fonte.
3. Durante a execução: botões individuais desabilitados; refresh da página retoma o polling.
4. Ao final: toast `Todas as fontes: N ok...`; histórico mostra "Todas as fontes" com linhas somadas e detalhe "N ok, M com erro"; cards individuais mostram "Última execução" atualizada (audits por fonte).
5. Conferir que a captação federal carregou a UF inteira (página Dinheiro na Mesa do município mostra pares preenchidos).
