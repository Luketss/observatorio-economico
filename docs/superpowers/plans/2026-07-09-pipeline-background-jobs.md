# Pipeline de Ingestão em Background + 6 Fontes Automáticas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar a coleta de dados por município/múltiplos municípios em background task com progresso, histórico e trava de concorrência, e migrar 6 datasets legados (pib, pix, estban, comex, bolsa_familia, pe_de_meia) para fontes automáticas in-app.

**Architecture:** Job persistido no Postgres (`ingestao_job`) + `threading.Thread` daemon no processo da API + polling HTTP. O runner (`runner.py`) é o único dono do ciclo de vida do job; as fontes só ganham um callback `progresso`. Fontes novas seguem o padrão consolidado: parser puro + `executar()` com upsert e commit por município + `registrar()`.

**Tech Stack:** FastAPI (sync), SQLAlchemy sync + Alembic, PostgreSQL, threading (stdlib), React + axios (polling).

**Spec:** `docs/superpowers/specs/2026-07-09-pipeline-background-jobs-design.md` (aprovado 2026-07-09).

## Global Constraints

- Testes backend são **pure-logic only**: `backend/tests` e `tests/` nunca abrem DB nem rede (decisão de projeto). Interação com DB é testada com `MagicMock`; parsers com fixtures reais recortadas.
- Rodar pytest/alembic/uvicorn a partir de `backend/` exige `backend/.env` (Settings lê `.env` relativo ao cwd). **`backend/.env` aponta para o Postgres da Railway (DB de dev real)** — `alembic upgrade head` roda contra ele.
- bcrypt TEM que ser 3.2.2 (4+/5 quebra passlib na coleta do pytest).
- venv da raiz (`venv/`) serve backend e ingestão.
- Qualquer dataset novo COM `municipio_id` precisa ser registrado em `municipio_management.py` — **não é o caso** de `ingestao_job` (não tem municipio_id, decisão do spec).
- Migration head atual: `0031_captacao_emendas`. A nova é `0032_ingestao_job`.
- Assinatura das fontes: `executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao`. `progresso` é `Callable[[int, int | None, str | None], None]` chamado como `progresso(atual, total, etapa)`.
- Commits de dados: upsert idempotente com commit por município (ou por competência nas fontes mensais).
- Frontend: `npm run build` em `frontend-observatorio/` é o gate (eslint baseline tem falsos-positivos endêmicos "motion unused" e set-state-in-effect — ignorar).
- Comandos abaixo assumem shell na raiz do repo; `venv\Scripts\python` no Windows.

---

### Task 1: Model `IngestaoJob` + migration 0032

**Files:**
- Create: `backend/app/models/ingestao_job.py`
- Create: `backend/alembic/versions/0032_ingestao_job.py`
- Test: `backend/tests/test_ingestao_job_schema.py`

**Interfaces:**
- Produces: classe `IngestaoJob` (tabela `ingestao_job`) com colunas `id, dataset, status, filtros, progresso_atual, progresso_total, etapa, resumo, erro, usuario_id, criado_em, iniciado_em, atualizado_em, finalizado_em`. Status válidos: `"pendente" | "executando" | "concluido" | "erro" | "abortado"`.

- [ ] **Step 0: Criar a branch**

```bash
git checkout -b feat/pipeline-background-jobs
```

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ingestao_job_schema.py
"""Schema do IngestaoJob — colunas e defaults, sem DB."""
from app.models.ingestao_job import IngestaoJob


def test_ingestao_job_colunas():
    cols = {c.name for c in IngestaoJob.__table__.columns}
    assert {
        "id", "dataset", "status", "filtros", "progresso_atual",
        "progresso_total", "etapa", "resumo", "erro", "usuario_id",
        "criado_em", "iniciado_em", "atualizado_em", "finalizado_em",
    } <= cols


def test_ingestao_job_defaults():
    tabela = IngestaoJob.__table__
    assert tabela.columns["status"].default.arg == "pendente"
    assert tabela.columns["progresso_atual"].default.arg == 0
    assert tabela.columns["usuario_id"].nullable is True
    assert tabela.columns["dataset"].nullable is False
```

- [ ] **Step 2: Run test to verify it fails**

Run (da raiz): `venv\Scripts\python -m pytest backend/tests/test_ingestao_job_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.ingestao_job'`

- [ ] **Step 3: Write the model**

```python
# backend/app/models/ingestao_job.py
from app.db.base import Base
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class IngestaoJob(Base):
    """Execução (job) de uma fonte automática em background. O estado vive no
    banco para que qualquer worker gunicorn responda o polling, independente de
    qual processo roda a thread. `atualizado_em` é o heartbeat — job
    'executando' sem heartbeat recente é órfão de deploy/restart."""

    __tablename__ = "ingestao_job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # 'pendente' | 'executando' | 'concluido' | 'erro' | 'abortado'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente", index=True)
    # {"estado": str|None, "municipio_ids": [int]|None, "anos": [int]|None, "notificar": bool}
    filtros: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    progresso_atual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progresso_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    etapa: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resumo: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id"), nullable=True, index=True
    )
    criado_em: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    iniciado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    finalizado_em: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `venv\Scripts\python -m pytest backend/tests/test_ingestao_job_schema.py -v`
Expected: 2 passed

- [ ] **Step 5: Registrar o model onde os demais são registrados**

Descubra onde `IngestaoAudit` é importado para o metadata (padrão do projeto):

```bash
grep -rn "ingestao_audit" backend/app/db/ backend/app/models/__init__.py backend/alembic/env.py
```

Adicione `from app.models.ingestao_job import IngestaoJob  # noqa` **no(s) mesmo(s) lugar(es)** em que `ingestao_audit` aparece (tipicamente `backend/app/db/base.py` ou `backend/app/models/__init__.py` + `alembic/env.py`). Espelhe o padrão exato encontrado.

- [ ] **Step 6: Write the migration**

```python
# backend/alembic/versions/0032_ingestao_job.py
"""add ingestao_job table

Jobs de execução em background das fontes automáticas: status, filtros,
progresso (heartbeat em atualizado_em), resumo e erro. Base do polling da
página /admin/fontes.

Revision ID: 0032_ingestao_job
Revises: 0031_captacao_emendas
Create Date: 2026-07-09
"""

import sqlalchemy as sa
from alembic import op


revision = "0032_ingestao_job"
down_revision = "0031_captacao_emendas"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestao_job",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pendente"),
        sa.Column("filtros", sa.JSON(), nullable=True),
        sa.Column("progresso_atual", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progresso_total", sa.Integer(), nullable=True),
        sa.Column("etapa", sa.String(length=100), nullable=True),
        sa.Column("resumo", sa.JSON(), nullable=True),
        sa.Column("erro", sa.Text(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("iniciado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestao_job_id"), "ingestao_job", ["id"], unique=False)
    op.create_index(op.f("ix_ingestao_job_dataset"), "ingestao_job", ["dataset"], unique=False)
    op.create_index(op.f("ix_ingestao_job_status"), "ingestao_job", ["status"], unique=False)
    op.create_index(op.f("ix_ingestao_job_usuario_id"), "ingestao_job", ["usuario_id"], unique=False)
    op.create_index(op.f("ix_ingestao_job_criado_em"), "ingestao_job", ["criado_em"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ingestao_job_criado_em"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_usuario_id"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_status"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_dataset"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_id"), table_name="ingestao_job")
    op.drop_table("ingestao_job")
```

- [ ] **Step 7: Rodar a migration (contra o DB de dev da Railway — atenção)**

```bash
cd backend && ..\venv\Scripts\python -m alembic upgrade head && cd ..
```

Expected: `Running upgrade 0031_captacao_emendas -> 0032_ingestao_job`

- [ ] **Step 8: Rodar a suíte inteira e commitar**

Run: `venv\Scripts\python -m pytest backend/tests tests -q`
Expected: tudo verde (75+ passed, +2 novos)

```bash
git add backend/app/models/ingestao_job.py backend/alembic/versions/0032_ingestao_job.py backend/tests/test_ingestao_job_schema.py
git add -u
git commit -m "feat(ingestao): model e migration do ingestao_job (jobs em background)"
```

---

### Task 2: Runner — helpers puros + `iniciar_job` + `_executar_job`

**Files:**
- Create: `backend/app/services/ingestao_automatica/runner.py`
- Test: `backend/tests/test_ingestao_runner.py`

**Interfaces:**
- Consumes: `IngestaoJob` (Task 1), `FONTES_AUTOMATICAS` (base.py), `record_ingestao_audit` (municipio_management.py).
- Produces:
  - `job_orfao(job, agora=None) -> bool` — puro.
  - `job_para_dict(job) -> dict` — serialização p/ API.
  - `resolver_municipios(db, filtros) -> list[Municipio]`.
  - `iniciar_job(db, dataset_key, filtros, usuario_id) -> IngestaoJob` — levanta `HTTPException` 404 (fonte/município) e 409 (job ativo).
  - `_executar_job(job_id)` — alvo da thread.
  - Constantes `JOB_ORFAO_MINUTOS = 10`, `STATUS_ATIVOS = ("pendente", "executando")`.

- [ ] **Step 1: Write the failing tests (lógica pura)**

```python
# backend/tests/test_ingestao_runner.py
"""Lógica de decisão do runner de jobs — sem DB, sem thread."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.ingestao_automatica.runner import job_orfao, job_para_dict

AGORA = datetime(2026, 7, 9, 12, 0, tzinfo=timezone.utc)


def _job(status, ha_minutos, **kw):
    ts = AGORA - timedelta(minutes=ha_minutos)
    base = dict(
        id=1, dataset="fpm", status=status, filtros={"estado": "MG"},
        progresso_atual=0, progresso_total=None, etapa=None, resumo=None,
        erro=None, usuario_id=4, criado_em=ts, iniciado_em=None,
        atualizado_em=None, finalizado_em=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_job_executando_sem_heartbeat_recente_e_orfao():
    job = _job("executando", ha_minutos=30, atualizado_em=AGORA - timedelta(minutes=30))
    assert job_orfao(job, agora=AGORA) is True


def test_job_executando_com_heartbeat_recente_nao_e_orfao():
    job = _job("executando", ha_minutos=30, atualizado_em=AGORA - timedelta(minutes=2))
    assert job_orfao(job, agora=AGORA) is False


def test_job_pendente_recente_nao_e_orfao_mas_antigo_sim():
    assert job_orfao(_job("pendente", ha_minutos=3), agora=AGORA) is False
    assert job_orfao(_job("pendente", ha_minutos=30), agora=AGORA) is True


def test_job_finalizado_nunca_e_orfao():
    assert job_orfao(_job("concluido", ha_minutos=999), agora=AGORA) is False
    assert job_orfao(_job("erro", ha_minutos=999), agora=AGORA) is False


def test_job_executando_sem_atualizado_em_usa_iniciado_ou_criado():
    job = _job("executando", ha_minutos=30)  # atualizado_em=None, iniciado_em=None
    assert job_orfao(job, agora=AGORA) is True


def test_job_para_dict_serializa_datas_e_campos():
    job = _job("concluido", ha_minutos=5, resumo={"linhas": 10},
               finalizado_em=AGORA, progresso_atual=7, progresso_total=7)
    d = job_para_dict(job)
    assert d["id"] == 1 and d["dataset"] == "fpm" and d["status"] == "concluido"
    assert d["progresso_atual"] == 7 and d["progresso_total"] == 7
    assert d["resumo"] == {"linhas": 10}
    assert d["filtros"] == {"estado": "MG"}
    assert d["finalizado_em"] == AGORA.isoformat()
    assert d["iniciado_em"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv\Scripts\python -m pytest backend/tests/test_ingestao_runner.py -v`
Expected: FAIL — `ModuleNotFoundError: ... runner`

- [ ] **Step 3: Write the runner**

```python
# backend/app/services/ingestao_automatica/runner.py
"""Runner dos jobs de ingestão em background.

Um job por vez (trava global): o container do Railway compartilha memória com
a API — duas fontes pesadas em paralelo arriscam OOM. A trava se autolibera:
job 'executando' sem heartbeat há JOB_ORFAO_MINUTOS é órfão de deploy/restart
e vira 'abortado' na próxima tentativa de criação.

A thread usa DUAS sessões: uma para a fonte (que faz commit por município) e
outra exclusiva para a linha do job — o heartbeat nunca commita trabalho
parcial da fonte."""
import logging
import threading
from datetime import datetime, timedelta, timezone
from dataclasses import asdict

from fastapi import HTTPException

from app.services.ingestao_automatica.base import FONTES_AUTOMATICAS

logger = logging.getLogger(__name__)

JOB_ORFAO_MINUTOS = 10
STATUS_ATIVOS = ("pendente", "executando")
_PASSO_HEARTBEAT = 25  # grava progresso a cada N municípios (ou mudança de etapa)


def _agora():
    return datetime.now(timezone.utc)


def job_orfao(job, agora=None) -> bool:
    """Job ativo cuja thread morreu (deploy/restart): 'executando' sem
    heartbeat recente, ou 'pendente' que nunca chegou a iniciar."""
    if job.status not in STATUS_ATIVOS:
        return False
    agora = agora or _agora()
    referencia = job.atualizado_em or job.iniciado_em or job.criado_em
    return (agora - referencia) > timedelta(minutes=JOB_ORFAO_MINUTOS)


def job_para_dict(job) -> dict:
    def _iso(dt):
        return dt.isoformat() if dt else None

    return {
        "id": job.id,
        "dataset": job.dataset,
        "status": job.status,
        "filtros": job.filtros,
        "progresso_atual": job.progresso_atual,
        "progresso_total": job.progresso_total,
        "etapa": job.etapa,
        "resumo": job.resumo,
        "erro": job.erro,
        "usuario_id": job.usuario_id,
        "criado_em": _iso(job.criado_em),
        "iniciado_em": _iso(job.iniciado_em),
        "atualizado_em": _iso(job.atualizado_em),
        "finalizado_em": _iso(job.finalizado_em),
    }


def resolver_municipios(db, filtros: dict):
    from app.models.municipio import Municipio

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    municipio_ids = (filtros or {}).get("municipio_ids")
    estado = (filtros or {}).get("estado")
    if municipio_ids:
        query = query.filter(Municipio.id.in_(municipio_ids))
    if estado:
        query = query.filter(Municipio.estado == estado.upper())
    return query.all()


def _atualizar_dataset_info(db, key: str, fonte_label: str, fonte_texto: str) -> None:
    """Movido do router: DatasetInfo ganha fonte default e data de atualização."""
    from app.models.dataset_info import DatasetInfo

    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == key).first()
    if info is None:
        info = DatasetInfo(dataset=key, titulo=fonte_label, conteudo="")
        db.add(info)
    if not info.fonte:
        info.fonte = fonte_texto
    info.data_atualizacao = datetime.now().strftime("%d/%m/%Y")
    db.commit()


def iniciar_job(db, dataset_key: str, filtros: dict, usuario_id: int):
    from app.models.ingestao_job import IngestaoJob

    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    if not resolver_municipios(db, filtros):
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")

    ativos = db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all()
    for ativo in ativos:
        if job_orfao(ativo):
            ativo.status = "abortado"
            ativo.erro = "Sem heartbeat — processo reiniciado durante a execução."
            ativo.finalizado_em = _agora()
        else:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe uma execução em andamento ({ativo.dataset}, job {ativo.id}). Aguarde terminar.",
            )
    db.commit()

    job = IngestaoJob(dataset=dataset_key, status="pendente", filtros=filtros, usuario_id=usuario_id)
    db.add(job)
    db.commit()
    db.refresh(job)

    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job


def _executar_job(job_id: int) -> None:
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob
    from app.services.municipio_management import record_ingestao_audit

    db = SessionLocal()       # sessão da fonte (commits por município)
    db_job = SessionLocal()   # sessão exclusiva da linha do job (heartbeat)
    try:
        job = db_job.get(IngestaoJob, job_id)
        fonte = FONTES_AUTOMATICAS[job.dataset]
        filtros = job.filtros or {}
        municipios = resolver_municipios(db, filtros)

        job.status = "executando"
        job.iniciado_em = _agora()
        job.atualizado_em = _agora()
        job.progresso_total = len(municipios)
        db_job.commit()

        ultimo_escrito = {"atual": -_PASSO_HEARTBEAT, "etapa": None}

        def progresso(atual, total=None, etapa=None):
            mudou_etapa = etapa is not None and etapa != ultimo_escrito["etapa"]
            terminou = total is not None and atual >= total
            if not mudou_etapa and not terminou and atual - ultimo_escrito["atual"] < _PASSO_HEARTBEAT:
                return
            job.progresso_atual = atual
            if total is not None:
                job.progresso_total = total
            if etapa is not None:
                job.etapa = etapa[:100]
            job.atualizado_em = _agora()
            db_job.commit()
            ultimo_escrito["atual"] = atual
            ultimo_escrito["etapa"] = etapa

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

        job.status = "concluido"
        job.resumo = asdict(resumo)
        job.progresso_atual = job.progresso_total or job.progresso_atual
        job.finalizado_em = _agora()
        job.atualizado_em = _agora()
        db_job.commit()
    except Exception as exc:  # noqa: BLE001 — thread não pode morrer sem registrar
        logger.exception("Job %s falhou", job_id)
        try:
            db.rollback()
            record_ingestao_audit(
                db, municipio_id=None, usuario_id=job.usuario_id, dataset=job.dataset,
                acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
            )
            job.status = "erro"
            job.erro = str(exc)[:1000]
            job.finalizado_em = _agora()
            job.atualizado_em = _agora()
            db_job.commit()
        except Exception:
            logger.exception("Falha ao registrar erro do job %s", job_id)
    finally:
        db.close()
        db_job.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `venv\Scripts\python -m pytest backend/tests/test_ingestao_runner.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/runner.py backend/tests/test_ingestao_runner.py
git commit -m "feat(ingestao): runner de jobs em background (thread + heartbeat + trava global)"
```

---

### Task 3: Callback `progresso` nas 4 fontes existentes

**Files:**
- Modify: `backend/app/services/ingestao_automatica/base.py:20` (comentário da assinatura)
- Modify: `backend/app/services/ingestao_automatica/populacao_ibge.py:63`
- Modify: `backend/app/services/ingestao_automatica/fpm_stn.py:100`
- Modify: `backend/app/services/ingestao_automatica/captacao_siconv.py` (função `executar`)
- Modify: `backend/app/services/ingestao_automatica/emendas_portal.py:95`

**Interfaces:**
- Consumes: convenção `progresso(atual, total, etapa)` do Task 2.
- Produces: as 4 fontes aceitam `progresso=None` sem quebrar chamadas existentes (kwarg com default).

Não há teste novo (as fontes continuam puras nos parsers; o callback é I/O de progresso). A suíte existente garante que nada quebrou.

- [ ] **Step 1: Atualizar o comentário de assinatura em `base.py`**

Em `base.py`, troque a linha do campo `executar`:

```python
    executar: Callable  # (db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao
```

- [ ] **Step 2: `populacao_ibge.py`** — assinatura e chamadas:

```python
def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
```

Dentro do loop `for m in com_codigo:` (linha ~94), adicione como primeira linha do corpo um contador; o padrão é enumerar:

```python
    for i, m in enumerate(com_codigo, start=1):
        if progresso:
            progresso(i, len(com_codigo), "processando municípios")
```

(mantendo o corpo existente; a busca por ano, antes do loop, ganha etapa própria:)

```python
    for ano in anos:
        if progresso:
            progresso(0, len(com_codigo), f"consultando IBGE {ano}")
        payload, erros_ano = _buscar_ano(ano, [m.codigo_ibge.strip() for m in com_codigo])
```

- [ ] **Step 3: `fpm_stn.py`** — assinatura idem; antes do download (linha ~112):

```python
    if progresso:
        progresso(0, len(municipios), "baixando CSV da STN (~30 MB)")
    resp = requests.get(_url_csv(), timeout=300)
```

E o loop `for m in municipios:` (linha ~118) vira:

```python
    for i, m in enumerate(municipios, start=1):
        if progresso:
            progresso(i, len(municipios), "processando municípios")
```

- [ ] **Step 4: `captacao_siconv.py`** — assinatura idem; antes de cada `_abrir(...)` no bloco do `TemporaryDirectory` (linhas ~180-187):

```python
        if progresso:
            progresso(0, len(municipios), "baixando proposta (190 MB)")
        with _abrir("siconv_proposta.csv.zip") as linhas:
            proposta_para_mid = parse_proposta_csv(linhas, alvo)
        if progresso:
            progresso(0, len(municipios), "baixando convênios")
        with _abrir("siconv_convenio.csv.zip") as linhas:
            convenios = parse_convenio_csv(linhas, proposta_para_mid, anos)
        if progresso:
            progresso(0, len(municipios), "baixando emendas")
        with _abrir("siconv_emenda.csv.zip") as linhas:
            via_emenda = parse_emenda_csv(linhas, convenios.ano_por_proposta)
        if progresso:
            progresso(0, len(municipios), "baixando desembolsos")
        with _abrir("siconv_desembolso.csv.zip") as linhas:
            desembolsos = parse_desembolso_csv(linhas, convenios.mid_por_convenio, anos)
```

E no loop por UF (linha ~198), acumule municípios processados:

```python
    processados = 0
    for uf in sorted(mids_por_uf):
        mids = mids_por_uf[uf]
        ...
        db.commit()
        processados += len(mids)
        if progresso:
            progresso(processados, len(uf_por_mid), f"gravando UF {uf}")
```

- [ ] **Step 5: `emendas_portal.py`** — assinatura idem; antes do download (linha ~117):

```python
    if progresso:
        progresso(0, len(alvo), "baixando zip de emendas (~32 MB)")
```

E o loop `for mid in sorted(set(alvo.values())):` (linha ~124) vira:

```python
    for i, mid in enumerate(sorted(set(alvo.values())), start=1):
        ...
        db.commit()
        if progresso:
            progresso(i, len(set(alvo.values())), "processando municípios")
```

(guarde `total = len(set(alvo.values()))` antes do loop para não recomputar.)

- [ ] **Step 6: Rodar a suíte e commitar**

Run: `venv\Scripts\python -m pytest backend/tests tests -q`
Expected: tudo verde

```bash
git add backend/app/services/ingestao_automatica/
git commit -m "feat(ingestao): callback de progresso nas 4 fontes existentes"
```

---

### Task 4: Router — POST 202 + endpoints de polling/histórico

**Files:**
- Modify: `backend/app/api/v1/routers/ingestao_automatica.py` (reescrita do arquivo)
- Test: `backend/tests/test_ingestao_runner.py` (acréscimo)

**Interfaces:**
- Consumes: `iniciar_job`, `job_para_dict`, `job_orfao`, `STATUS_ATIVOS` (Task 2).
- Produces:
  - `POST /ingestao-automatica/{key}/executar` → 202 `{"job_id": int}`. Body: `{estado?, municipio_ids?, anos?, notificar}`.
  - `GET /ingestao-automatica/jobs/{id}` → dict do job (404 se não existe).
  - `GET /ingestao-automatica/jobs?dataset=&limit=` → lista (desc por criado_em, limit default 20, max 100).
  - `GET /ingestao-automatica/fontes` → `{"fontes": [...], "job_ativo": dict|None}` — **shape novo**; cada fonte ganha `ultimo_job` além de `ultima_execucao`.

- [ ] **Step 1: Reescrever o router**

```python
# backend/app/api/v1/routers/ingestao_automatica.py
from app.api.deps import get_db, require_role
from app.models.ingestao_audit import IngestaoAudit
from app.models.ingestao_job import IngestaoJob
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.ingestao_automatica.runner import (
    STATUS_ATIVOS,
    iniciar_job,
    job_orfao,
    job_para_dict,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ingestao-automatica", tags=["Ingestão Automática"])


class ExecutarIn(BaseModel):
    estado: str | None = None
    municipio_ids: list[int] | None = None
    anos: list[int] | None = None
    notificar: bool = True


def _job_ativo(db: Session) -> IngestaoJob | None:
    """Job pendente/executando com heartbeat vivo (órfão não conta)."""
    for job in db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all():
        if not job_orfao(job):
            return job
    return None


@router.get("/fontes")
def listar_fontes(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    ativo = _job_ativo(db)
    fontes = []
    for key, fonte in FONTES_AUTOMATICAS.items():
        ultimo_audit = (
            db.query(IngestaoAudit)
            .filter(IngestaoAudit.acao == "auto_ingest", IngestaoAudit.dataset == key)
            .order_by(IngestaoAudit.criado_em.desc())
            .first()
        )
        ultimo_job = (
            db.query(IngestaoJob)
            .filter(IngestaoJob.dataset == key)
            .order_by(IngestaoJob.criado_em.desc())
            .first()
        )
        fontes.append({
            "key": key,
            "label": fonte.label,
            "fonte": fonte.fonte,
            "ultima_execucao": None if ultimo_audit is None else {
                "criado_em": ultimo_audit.criado_em,
                "status": ultimo_audit.status,
                "num_linhas": ultimo_audit.num_linhas,
                "detalhe": ultimo_audit.detalhe,
            },
            "ultimo_job": None if ultimo_job is None else job_para_dict(ultimo_job),
        })
    return {"fontes": fontes, "job_ativo": None if ativo is None else job_para_dict(ativo)}


@router.post("/{dataset_key}/executar", status_code=202)
def executar_fonte(
    dataset_key: str,
    body: ExecutarIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    filtros = {
        "estado": body.estado.upper() if body.estado else None,
        "municipio_ids": body.municipio_ids,
        "anos": body.anos,
        "notificar": body.notificar,
    }
    job = iniciar_job(db, dataset_key, filtros, current_user.id)
    return {"job_id": job.id}


@router.get("/jobs/{job_id}")
def obter_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    job = db.get(IngestaoJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return job_para_dict(job)


@router.get("/jobs")
def listar_jobs(
    dataset: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    query = db.query(IngestaoJob)
    if dataset:
        query = query.filter(IngestaoJob.dataset == dataset)
    jobs = query.order_by(IngestaoJob.criado_em.desc()).limit(limit).all()
    return [job_para_dict(j) for j in jobs]
```

**Atenção à ordem das rotas:** `GET /jobs/{job_id}` e `GET /jobs` precisam vir ANTES de qualquer rota `/{dataset_key}` genérica em GET — aqui só o POST usa `/{dataset_key}/executar`, então não há conflito, mas mantenha a ordem acima.

- [ ] **Step 2: Verificar que o app importa e as rotas existem**

```bash
cd backend && ..\venv\Scripts\python -c "from app.main import app; print([r.path for r in app.routes if 'ingestao' in r.path])" && cd ..
```

Expected: lista contendo `/api/v1/ingestao-automatica/fontes`, `/api/v1/ingestao-automatica/{dataset_key}/executar`, `/api/v1/ingestao-automatica/jobs/{job_id}`, `/api/v1/ingestao-automatica/jobs`

- [ ] **Step 3: Rodar a suíte e commitar**

Run: `venv\Scripts\python -m pytest backend/tests tests -q`
Expected: tudo verde

```bash
git add backend/app/api/v1/routers/ingestao_automatica.py
git commit -m "feat(ingestao): endpoints de job em background (202 + polling + historico)"
```

---

### Task 5: `util.py` — `norm_nome_municipio` compartilhado + `competencias_janela`

**Files:**
- Modify: `backend/app/services/ingestao_automatica/util.py`
- Modify: `backend/app/services/ingestao_automatica/fpm_stn.py:34-44` (delega para util)
- Test: `backend/tests/test_ingestao_automatica.py` (acréscimo)

**Interfaces:**
- Produces:
  - `norm_nome_municipio(s) -> str` em `util.py` (mesma lógica do `_norm_nome` do fpm_stn; `fpm_stn._norm_nome` vira alias para não quebrar imports dos testes existentes).
  - `competencias_janela(anos=None, inicio=(2022, 1), meses_default=12, hoje=None) -> list[tuple[int, int]]` — lista `(ano, mes)` crescente. Com `anos`: todos os meses desses anos clampados em `[inicio, mês anterior a hoje]`. Sem `anos`: últimas `meses_default` competências até o mês anterior a hoje.

- [ ] **Step 1: Write the failing tests**

Acrescente ao final de `backend/tests/test_ingestao_automatica.py`:

```python
# ── util: competências das fontes mensais ────────────────────────────────────
from datetime import date

from app.services.ingestao_automatica.util import competencias_janela, norm_nome_municipio


def test_competencias_default_ultimos_12_meses():
    out = competencias_janela(hoje=date(2026, 7, 9))
    assert len(out) == 12
    assert out[0] == (2025, 7)
    assert out[-1] == (2026, 6)  # mês anterior ao corrente


def test_competencias_por_anos_clampa_inicio_e_fim():
    out = competencias_janela(anos=[2021, 2022], inicio=(2022, 1), hoje=date(2026, 7, 9))
    assert out[0] == (2022, 1)          # 2021 clampado para o início da série
    assert out[-1] == (2022, 12)
    out2 = competencias_janela(anos=[2026], inicio=(2022, 1), hoje=date(2026, 7, 9))
    assert out2[-1] == (2026, 6)        # nunca inclui o mês corrente/futuro


def test_norm_nome_municipio_compartilhado():
    assert norm_nome_municipio("Divinópolis") == "divinopolis"
    assert norm_nome_municipio("São Thomé das Letras") == norm_nome_municipio("São Tomé das Letras")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv\Scripts\python -m pytest backend/tests/test_ingestao_automatica.py -v -k "competencias or compartilhado"`
Expected: FAIL — ImportError

- [ ] **Step 3: Implementar em `util.py`**

Adicione ao final de `util.py`:

```python
import re
import unicodedata
from datetime import date


def norm_nome_municipio(s) -> str:
    """Normaliza nome de município para match entre a grafia IBGE do banco e
    grafias históricas de CSVs federais (acentos, caixa, hífens, 'th', s/z).
    Aplicar nos DOIS lados do match. (Movido de fpm_stn._norm_nome.)"""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ").replace("'", " ").replace("’", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("th", "t").replace("z", "s")


def competencias_janela(anos=None, inicio=(2022, 1), meses_default=12, hoje=None):
    """Competências (ano, mes) de fontes mensais. Com `anos`, todos os meses
    desses anos; sem, as últimas `meses_default`. Sempre clampado entre
    `inicio` e o mês ANTERIOR a `hoje` (o mês corrente nunca está publicado)."""
    hoje = hoje or date.today()
    fim_ano, fim_mes = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)

    def _le(a, b):  # (ano, mes) <= (ano, mes)
        return a[0] < b[0] or (a[0] == b[0] and a[1] <= b[1])

    if anos:
        candidatas = [(a, m) for a in sorted(set(anos)) for m in range(1, 13)]
    else:
        candidatas = []
        a, m = fim_ano, fim_mes
        for _ in range(meses_default):
            candidatas.append((a, m))
            a, m = (a, m - 1) if m > 1 else (a - 1, 12)
        candidatas.reverse()
    return [c for c in candidatas if _le(inicio, c) and _le(c, (fim_ano, fim_mes))]
```

Em `fpm_stn.py`, substitua o corpo de `_norm_nome` por delegação (mantém o nome exportado que os testes usam):

```python
from app.services.ingestao_automatica.util import parse_valor_br as _parse_valor, norm_nome_municipio


def _norm_nome(s) -> str:
    """Delegado para util.norm_nome_municipio (compartilhado entre fontes)."""
    return norm_nome_municipio(s)
```

(Remova os imports `re`/`unicodedata` de `fpm_stn.py` se ficarem órfãos.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `venv\Scripts\python -m pytest backend/tests/test_ingestao_automatica.py -v`
Expected: todos passed (novos + antigos de _norm_nome)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingestao_automatica/util.py backend/app/services/ingestao_automatica/fpm_stn.py backend/tests/test_ingestao_automatica.py
git commit -m "refactor(ingestao): norm_nome_municipio e competencias_janela compartilhados em util"
```

---

### Task 6: Fonte `pib_ibge`

**Files:**
- Create: `backend/app/services/ingestao_automatica/pib_ibge.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py` (import de registro)
- Test: `backend/tests/test_pib_ibge.py`

**Interfaces:**
- Consumes: `codigo_ibge_valido` (populacao_ibge), `FonteAutomatica/ResumoIngestao/registrar` (base).
- Produces: fonte key `"pib"`; `parse_pib_ibge(payload) -> dict[str, dict[int, dict]]` (`{codigo_ibge: {ano: {coluna_model: float}}}`, valores em **R$ mil** — unidade do model, ver GUIA §PIB).

**Fonte de dados:** API de agregados do IBGE, tabela 5938 (PIB dos Municípios). Variáveis → colunas:
`37`→`pib_total` (PIB a preços correntes), `513`→`va_agropecuaria`, `517`→`va_industria`, `6575`→`va_servicos` (exclusive adm), `525`→`va_governo` (adm/defesa/educação/saúde públicas). Todas em "Mil Reais". Grava só `tipo_dado="REAL"`.

- [ ] **Step 1: Verificar variáveis e unidade contra a API real (uma vez, sem código)**

```bash
curl -s "https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2021/variaveis/37|513|517|6575|525?localidades=N6[3122306]"
```

Expected: JSON com 5 variáveis, unidade "Mil Reais", localidade Divinópolis. **Compare `pib_total` de 2021 com a linha existente no banco** (`SELECT pib_total FROM pib_anual pa JOIN municipios m ON m.id=pa.municipio_id WHERE m.nome='Divinópolis' AND ano=2021 AND tipo_dado='REAL'`) — mesma ordem de grandeza (R$ mil). Se os IDs de variável divergirem do esperado, corrija a constante `VARIAVEIS` abaixo com o que a API retornar (o campo `"id"` de cada variável) e ajuste a fixture do teste.

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_pib_ibge.py
"""Parser puro do PIB (IBGE agregado 5938) — sem rede, sem DB.
Fixture no formato real da API de agregados (2026-07)."""
from app.services.ingestao_automatica.pib_ibge import parse_pib_ibge

PAYLOAD = [
    {"id": "37", "variavel": "Produto Interno Bruto a preços correntes", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "9000000", "2021": "10500000"}},
     ]}]},
    {"id": "513", "variavel": "Valor adicionado bruto a preços correntes da agropecuária", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "100000", "2021": "..."}},
     ]}]},
    {"id": "525", "variavel": "VAB adm pública", "unidade": "Mil Reais",
     "resultados": [{"series": [
         {"localidade": {"id": "3122306"}, "serie": {"2020": "800000"}},
     ]}]},
]


def test_parse_pib_agrupa_por_codigo_ano_e_coluna():
    out = parse_pib_ibge(PAYLOAD)
    assert out["3122306"][2020]["pib_total"] == 9000000.0
    assert out["3122306"][2020]["va_agropecuaria"] == 100000.0
    assert out["3122306"][2020]["va_governo"] == 800000.0
    assert out["3122306"][2021] == {"pib_total": 10500000.0}  # "..." ignorado


def test_parse_pib_payload_vazio():
    assert parse_pib_ibge([]) == {}
    assert parse_pib_ibge(None) == {}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_pib_ibge.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write the fonte**

```python
# backend/app/services/ingestao_automatica/pib_ibge.py
"""Fonte automática: PIB dos Municípios (IBGE, agregado 5938).

Valores em R$ MIL (unidade da API e do model pib_anual — GUIA §PIB). Grava
apenas tipo_dado="REAL"; linhas PROJETADO legadas ficam intocadas. O IBGE
publica com defasagem de ~2 anos; sem `anos`, usa os últimos 6 disponíveis
(períodos "-6")."""
import logging

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

# id da variável na API → coluna do model PibAnual (unidade: Mil Reais)
VARIAVEIS = {
    "37": "pib_total",
    "513": "va_agropecuaria",
    "517": "va_industria",
    "6575": "va_servicos",
    "525": "va_governo",
}
IBGE_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/5938/"
    "periodos/{periodos}/variaveis/" + "|".join(VARIAVEIS) + "?localidades=N6[{codigos}]"
)
_CHUNK = 50  # códigos por requisição (URL menor que a do agregado 6579: 5 variáveis)


def parse_pib_ibge(payload) -> dict[str, dict[int, dict]]:
    """Payload da API → {codigo_ibge: {ano: {coluna: valor_float}}}.
    Valores não numéricos ('...', '-') são ignorados."""
    out: dict[str, dict[int, dict]] = {}
    for variavel in payload or []:
        coluna = VARIAVEIS.get(str(variavel.get("id")))
        if coluna is None:
            continue
        for resultado in variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo = str((serie.get("localidade") or {}).get("id") or "")
                for ano_str, valor in (serie.get("serie") or {}).items():
                    try:
                        out.setdefault(codigo, {}).setdefault(int(ano_str), {})[coluna] = float(valor)
                    except (TypeError, ValueError):
                        continue
    return {k: {a: v for a, v in anos.items() if v} for k, anos in out.items() if anos}


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pib import PibAnual
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="pib")
    com_codigo = []
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            com_codigo.append(m)
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not com_codigo:
        return resumo

    periodos = "|".join(str(a) for a in sorted(set(anos))) if anos else "-6"

    por_codigo: dict[str, dict[int, dict]] = {}
    codigos = [m.codigo_ibge.strip() for m in com_codigo]
    for i in range(0, len(codigos), _CHUNK):
        chunk = codigos[i:i + _CHUNK]
        if progresso:
            progresso(0, len(com_codigo), f"consultando IBGE (lote {i // _CHUNK + 1})")
        try:
            resp = requests.get(
                IBGE_URL.format(periodos=periodos, codigos=",".join(chunk)), timeout=120
            )
            resp.raise_for_status()
            for codigo, serie in parse_pib_ibge(resp.json()).items():
                por_codigo.setdefault(codigo, {}).update(serie)
        except requests.RequestException as exc:
            resumo.erros.append(f"IBGE PIB (lote {i // _CHUNK + 1}): {exc}")

    for i, m in enumerate(com_codigo, start=1):
        if progresso:
            progresso(i, len(com_codigo), "processando municípios")
        serie = por_codigo.get(m.codigo_ibge.strip())
        if not serie:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: IBGE não retornou PIB")
            continue
        existentes = {
            r.ano: r
            for r in db.query(PibAnual)
            .filter(PibAnual.municipio_id == m.id, PibAnual.tipo_dado == "REAL")
            .all()
        }
        for ano, valores in sorted(serie.items()):
            if "pib_total" not in valores:
                continue  # PIB_Total nunca deve ser null (GUIA)
            reg = existentes.get(ano)
            if reg:
                for coluna, valor in valores.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(PibAnual(municipio_id=m.id, ano=ano, tipo_dado="REAL", **valores))
            resumo.linhas += 1
        resumo.municipios_ok += 1
        db.commit()
    return resumo


registrar(FonteAutomatica(
    key="pib",
    label="PIB Municipal (IBGE)",
    fonte="IBGE — Produto Interno Bruto dos Municípios (agregado 5938, R$ mil)",
    executar=executar,
))
```

- [ ] **Step 5: Registrar no `__init__.py`**

Adicione a `backend/app/services/ingestao_automatica/__init__.py`:

```python
from app.services.ingestao_automatica import pib_ibge  # noqa: F401
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `venv\Scripts\python -m pytest backend/tests/test_pib_ibge.py backend/tests -q`
Expected: tudo verde

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ingestao_automatica/pib_ibge.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_pib_ibge.py
git commit -m "feat(ingestao): fonte automatica do PIB (IBGE agregado 5938)"
```

---

### Task 7: Fonte `pix_bcb`

**Files:**
- Create: `backend/app/services/ingestao_automatica/pix_bcb.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py`
- Test: `backend/tests/test_pix_bcb.py`

**Interfaces:**
- Consumes: `codigo_ibge_valido`, `competencias_janela` (Task 5), base.
- Produces: fonte key `"pix"`; `parse_pix_olinda(valores, ibge_para_mid) -> dict[int, dict]` (`{mid: {coluna_model: valor}}` para UMA competência).

**Fonte de dados:** API Olinda/BCB, recurso `TransacoesPixPorMunicipio(DataBase=@DataBase)` — 1 request JSON por competência (payload nacional ~5,6k municípios). Os nomes de campo do payload são os MESMOS do CSV legado (`VL_PagadorPF`, `QT_PagadorPF`, `QT_PES_PagadorPF`, ..., ver GUIA §12) + `Municipio_Ibge`.

- [ ] **Step 1: Capturar uma resposta real e validar os nomes de campo**

```bash
curl -s "https://olinda.bcb.gov.br/olinda/servico/Pix_DadosAbertos/versao/v1/odata/TransacoesPixPorMunicipio(DataBase=@DataBase)?@DataBase='202605'&\$format=json&\$top=3"
```

Expected: JSON `{"value": [{...}]}` com chaves `Municipio_Ibge`, `VL_PagadorPF`, `QT_PagadorPF`, `QT_PES_PagadorPF`, `VL_PagadorPJ`, ..., `QT_PES_RecebedorPJ`. Se algum nome divergir, ajuste `CAMPOS` abaixo e a fixture com a resposta real. Se a resposta trouxer `@odata.nextLink` com `$top=10000`, a paginação do Step 4 já cobre.

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_pix_bcb.py
"""Parser puro do PIX (Olinda/BCB) — sem rede, sem DB.
Fixture no formato real do recurso TransacoesPixPorMunicipio."""
from app.services.ingestao_automatica.pix_bcb import parse_pix_olinda

VALORES = [
    {"Municipio_Ibge": "3122306", "Municipio": "DIVINOPOLIS", "Estado": "MG",
     "VL_PagadorPF": 150000.50, "QT_PagadorPF": 1200, "QT_PES_PagadorPF": 300,
     "VL_PagadorPJ": 90000.0, "QT_PagadorPJ": 400, "QT_PES_PagadorPJ": 80,
     "VL_RecebedorPF": 140000.0, "QT_RecebedorPF": 1100, "QT_PES_RecebedorPF": 290,
     "VL_RecebedorPJ": 100000.0, "QT_RecebedorPJ": 500, "QT_PES_RecebedorPJ": 90},
    {"Municipio_Ibge": "9999999", "VL_PagadorPF": 1.0},  # fora do alvo
]


def test_parse_pix_filtra_alvo_e_mapeia_colunas():
    out = parse_pix_olinda(VALORES, {"3122306": 42})
    assert set(out) == {42}
    assert out[42]["vl_pagador_pf"] == 150000.50
    assert out[42]["qt_pes_recebedor_pj"] == 90


def test_parse_pix_valores_ausentes_viram_none():
    out = parse_pix_olinda([{"Municipio_Ibge": "3122306", "VL_PagadorPF": 10.0}], {"3122306": 42})
    assert out[42]["vl_pagador_pf"] == 10.0
    assert out[42]["qt_pagador_pf"] is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_pix_bcb.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write the fonte**

```python
# backend/app/services/ingestao_automatica/pix_bcb.py
"""Fonte automática: estatísticas de transações PIX por município (BCB/Olinda).

Um request JSON por competência (payload nacional, ~5,6k municípios) — os
campos do recurso TransacoesPixPorMunicipio mapeiam 1:1 nas colunas de
pix_mensal. Competência sem publicação retorna value vazio (não é erro)."""
import logging

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import competencias_janela

logger = logging.getLogger(__name__)

OLINDA_URL = (
    "https://olinda.bcb.gov.br/olinda/servico/Pix_DadosAbertos/versao/v1/odata/"
    "TransacoesPixPorMunicipio(DataBase=@DataBase)?@DataBase='{anomes}'&$format=json&$top=10000"
)
# campo do payload Olinda → coluna do model PixMensal
CAMPOS = {
    "VL_PagadorPF": "vl_pagador_pf", "QT_PagadorPF": "qt_pagador_pf", "QT_PES_PagadorPF": "qt_pes_pagador_pf",
    "VL_PagadorPJ": "vl_pagador_pj", "QT_PagadorPJ": "qt_pagador_pj", "QT_PES_PagadorPJ": "qt_pes_pagador_pj",
    "VL_RecebedorPF": "vl_recebedor_pf", "QT_RecebedorPF": "qt_recebedor_pf", "QT_PES_RecebedorPF": "qt_pes_recebedor_pf",
    "VL_RecebedorPJ": "vl_recebedor_pj", "QT_RecebedorPJ": "qt_recebedor_pj", "QT_PES_RecebedorPJ": "qt_pes_recebedor_pj",
}
INICIO_SERIE = (2020, 11)  # primeiras estatísticas municipais do PIX


def parse_pix_olinda(valores, ibge_para_mid: dict[str, int]) -> dict[int, dict]:
    """Lista `value` de UMA competência → {mid: {coluna_model: valor}}."""
    out: dict[int, dict] = {}
    for item in valores or []:
        mid = ibge_para_mid.get(str(item.get("Municipio_Ibge") or "").strip())
        if mid is None:
            continue
        out[mid] = {coluna: item.get(campo) for campo, coluna in CAMPOS.items()}
    return out


def _buscar_competencia(anomes: str) -> list:
    url = OLINDA_URL.format(anomes=anomes)
    valores: list = []
    while url:
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()
        corpo = resp.json()
        valores.extend(corpo.get("value") or [])
        url = corpo.get("@odata.nextLink")
    return valores


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pix import PixMensal
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="pix")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        if progresso:
            progresso(0, len(alvo), f"PIX {anomes} ({i}/{len(competencias)})")
        try:
            valores = _buscar_competencia(anomes)
        except requests.RequestException as exc:
            resumo.erros.append(f"PIX {anomes}: {exc}")
            continue
        por_mid = parse_pix_olinda(valores, alvo)
        existentes = {
            r.municipio_id: r
            for r in db.query(PixMensal)
            .filter(PixMensal.municipio_id.in_(list(por_mid)), PixMensal.ano == ano, PixMensal.mes == mes)
            .all()
        } if por_mid else {}
        for mid, campos in por_mid.items():
            reg = existentes.get(mid)
            if reg:
                for coluna, valor in campos.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(PixMensal(municipio_id=mid, ano=ano, mes=mes, **campos))
            resumo.linhas += 1
            mids_ok.add(mid)
        db.commit()
        if progresso:
            progresso(len(mids_ok), len(alvo), f"PIX {anomes} gravado")

    resumo.municipios_ok = len(mids_ok)
    resumo.municipios_erro += len(set(alvo.values()) - mids_ok)
    for codigo, mid in alvo.items():
        if mid not in mids_ok:
            resumo.erros.append(f"IBGE {codigo}: sem dados PIX na janela")
    return resumo


registrar(FonteAutomatica(
    key="pix",
    label="PIX — transações por município (BCB)",
    fonte="Banco Central — Estatísticas do PIX por município (API Olinda)",
    executar=executar,
))
```

- [ ] **Step 5: Registrar no `__init__.py`, rodar testes e commitar**

```python
from app.services.ingestao_automatica import pix_bcb  # noqa: F401
```

Run: `venv\Scripts\python -m pytest backend/tests -q`
Expected: tudo verde

```bash
git add backend/app/services/ingestao_automatica/pix_bcb.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_pix_bcb.py
git commit -m "feat(ingestao): fonte automatica do PIX (BCB Olinda)"
```

---

### Task 8: Fonte `comex_mdic`

**Files:**
- Create: `backend/app/services/ingestao_automatica/comex_mdic.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py`
- Test: `backend/tests/test_comex_mdic.py`

**Interfaces:**
- Consumes: `codigo_ibge_valido`, base, `requests`.
- Produces: fonte key `"comex"`; `parse_comex_mun(linhas, ibge_para_mid, tipo_operacao) -> dict` com agregados nos 3 níveis.

**Fonte de dados:** Comex Stat/MDIC — CSVs anuais por município `EXP_{ano}_MUN.csv` / `IMP_{ano}_MUN.csv` (~30-80 MB/ano) em `https://balanca.economia.gov.br/balanca/bd/comexstat-bd/mun/`, colunas `"CO_ANO";"CO_MES";"SH4";"CO_PAIS";"SG_UF_MUN";"CO_MUN";"KG_LIQUIDO";"VL_FOB"` (aspas, `;`, latin-1). Tabelas auxiliares: `https://balanca.economia.gov.br/balanca/bd/tabelas/PAIS.csv` (`CO_PAIS`→`NO_PAIS`) e `https://balanca.economia.gov.br/balanca/bd/tabelas/NCM_SH.csv` (`CO_SH4`→`NO_SH4_POR`).

**Semântica de escrita: REPLACE por (município, ano)** — as 3 tabelas comex são agregados; upsert deixaria lixo de produtos/países que saíram. Antes de inserir, deletar as linhas do município nos anos processados.

- [ ] **Step 1: Validar URLs e o formato do CO_MUN**

```bash
curl -sI "https://balanca.economia.gov.br/balanca/bd/comexstat-bd/mun/EXP_2025_MUN.csv" | head -5
curl -s "https://balanca.economia.gov.br/balanca/bd/comexstat-bd/mun/EXP_2025_MUN.csv" --range 0-500
```

Expected: 200 + header `"CO_ANO";"CO_MES";"SH4";...;"CO_MUN";...`. Confirme que `CO_MUN` é código IBGE de 7 dígitos (ex.: um valor `31xxxxx` para MG). Se o dígito verificador divergir do IBGE (quirk conhecido do Comex Stat em municípios antigos), registre no docstring e siga — o match é por código exato e municípios sem match entram em `resumo.erros`.

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_comex_mdic.py
"""Parser puro do Comex Stat (MDIC) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.comex_mdic import parse_comex_mun

CSV_MUN = io.StringIO(
    '"CO_ANO";"CO_MES";"SH4";"CO_PAIS";"SG_UF_MUN";"CO_MUN";"KG_LIQUIDO";"VL_FOB"\n'
    '"2025";"1";"0901";"063";"MG";"3122306";"1000";"5000"\n'
    '"2025";"1";"0901";"063";"MG";"3122306";"500";"2500"\n'
    '"2025";"2";"7202";"160";"MG";"3122306";"20000";"90000"\n'
    '"2025";"1";"0901";"063";"SP";"3550308";"99";"99"\n'   # fora do alvo
)


def test_parse_comex_agrega_mensal_produto_pais():
    out = parse_comex_mun(CSV_MUN, {"3122306": 42}, "export")
    assert out["mensal"][(42, 2025, 1, "export")] == {"valor_usd": 7500.0, "peso_kg": 1500.0}
    assert out["mensal"][(42, 2025, 2, "export")]["valor_usd"] == 90000.0
    assert out["por_produto"][(42, 2025, "export", "0901")] == {"valor_usd": 7500.0, "peso_kg": 1500.0}
    assert out["por_pais"][(42, 2025, "export", "063")] == {"valor_usd": 7500.0}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_comex_mdic.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write the fonte**

```python
# backend/app/services/ingestao_automatica/comex_mdic.py
"""Fonte automática: comércio exterior por município (Comex Stat/MDIC).

CSVs anuais EXP/IMP_{ano}_MUN.csv (latin-1, ';', campos entre aspas) com
CO_MUN = código IBGE de 7 dígitos. Semântica REPLACE por (município, ano):
as 3 tabelas comex são agregados — upsert deixaria produtos/países que
saíram da pauta como lixo. `produto` recebe "SH4 — descrição" (via NCM_SH.csv)
e `pais` o nome em português (via PAIS.csv); anos legados não reprocessados
mantêm o formato antigo (código puro), sem duplicar dentro do mesmo ano."""
import csv
import io
import logging
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar

logger = logging.getLogger(__name__)

BASE_MUN = "https://balanca.economia.gov.br/balanca/bd/comexstat-bd/mun/{tipo}_{ano}_MUN.csv"
URL_PAIS = "https://balanca.economia.gov.br/balanca/bd/tabelas/PAIS.csv"
URL_SH = "https://balanca.economia.gov.br/balanca/bd/tabelas/NCM_SH.csv"
TIPOS = (("EXP", "export"), ("IMP", "import"))


def parse_comex_mun(linhas, ibge_para_mid: dict[str, int], tipo_operacao: str) -> dict:
    """CSV MUN (iterável de linhas) → agregados {mensal, por_produto, por_pais}.
    Chaves: mensal=(mid, ano, mes, tipo); por_produto=(mid, ano, tipo, sh4);
    por_pais=(mid, ano, tipo, co_pais). Códigos ficam crus aqui — a tradução
    para rótulos acontece no executar()."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV MUN vazio")
    idx = {c.strip('"').strip(): i for i, c in enumerate(header)}
    faltando = [c for c in ("CO_ANO", "CO_MES", "SH4", "CO_PAIS", "CO_MUN", "KG_LIQUIDO", "VL_FOB") if c not in idx]
    if faltando:
        raise ValueError(f"CSV MUN: colunas ausentes {faltando} — layout mudou?")

    mensal: dict = {}
    por_produto: dict = {}
    por_pais: dict = {}
    for row in reader:
        try:
            mid = ibge_para_mid.get(row[idx["CO_MUN"]].strip('"').strip())
            if mid is None:
                continue
            ano = int(row[idx["CO_ANO"]].strip('"'))
            mes = int(row[idx["CO_MES"]].strip('"'))
            valor = float(row[idx["VL_FOB"]].strip('"') or 0)
            peso = float(row[idx["KG_LIQUIDO"]].strip('"') or 0)
            sh4 = row[idx["SH4"]].strip('"').strip()
            pais = row[idx["CO_PAIS"]].strip('"').strip()
        except (IndexError, ValueError):
            continue
        km = (mid, ano, mes, tipo_operacao)
        mensal.setdefault(km, {"valor_usd": 0.0, "peso_kg": 0.0})
        mensal[km]["valor_usd"] += valor
        mensal[km]["peso_kg"] += peso
        kp = (mid, ano, tipo_operacao, sh4)
        por_produto.setdefault(kp, {"valor_usd": 0.0, "peso_kg": 0.0})
        por_produto[kp]["valor_usd"] += valor
        por_produto[kp]["peso_kg"] += peso
        kc = (mid, ano, tipo_operacao, pais)
        por_pais.setdefault(kc, {"valor_usd": 0.0})
        por_pais[kc]["valor_usd"] += valor
    return {"mensal": mensal, "por_produto": por_produto, "por_pais": por_pais}


def _tabela_auxiliar(url: str, col_codigo: str, col_nome: str) -> dict[str, str]:
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    reader = csv.reader(io.StringIO(resp.content.decode("latin-1")), delimiter=";")
    header = next(reader)
    idx = {c.strip('"').strip(): i for i, c in enumerate(header)}
    out: dict[str, str] = {}
    for row in reader:
        try:
            out[row[idx[col_codigo]].strip('"').strip()] = row[idx[col_nome]].strip('"').strip()
        except (IndexError, KeyError):
            continue
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.comex import ComexMensal, ComexPorPais, ComexPorProduto
    from app.services.ingestao_automatica.populacao_ibge import codigo_ibge_valido

    resumo = ResumoIngestao(dataset="comex")
    alvo: dict[str, int] = {}
    for m in municipios:
        if codigo_ibge_valido(m.codigo_ibge):
            alvo[m.codigo_ibge.strip()] = m.id
        else:
            resumo.municipios_erro += 1
            resumo.erros.append(f"{m.nome}/{m.estado}: codigo_ibge ausente/inválido")
    if not alvo:
        return resumo

    if not anos:
        atual = date.today().year
        anos = [atual - 2, atual - 1, atual]
    anos = sorted(set(anos))

    if progresso:
        progresso(0, len(alvo), "baixando tabelas auxiliares (SH4, países)")
    nome_sh4 = _tabela_auxiliar(URL_SH, "CO_SH4", "NO_SH4_POR")
    nome_pais = _tabela_auxiliar(URL_PAIS, "CO_PAIS", "NO_PAIS")

    mensal: dict = {}
    por_produto: dict = {}
    por_pais: dict = {}
    for ano in anos:
        for sigla, tipo in TIPOS:
            if progresso:
                progresso(0, len(alvo), f"baixando {sigla} {ano}")
            try:
                resp = requests.get(BASE_MUN.format(tipo=sigla, ano=ano), timeout=(30, 600))
                resp.raise_for_status()
            except requests.RequestException as exc:
                resumo.erros.append(f"Comex {sigla} {ano}: {exc}")
                continue
            parsed = parse_comex_mun(
                io.StringIO(resp.content.decode("latin-1")), alvo, tipo
            )
            mensal.update(parsed["mensal"])
            por_produto.update(parsed["por_produto"])
            por_pais.update(parsed["por_pais"])

    todos_mids = sorted(set(alvo.values()))
    for i, mid in enumerate(todos_mids, start=1):
        if progresso:
            progresso(i, len(todos_mids), "gravando municípios")
        # REPLACE por (município, anos processados)
        for model in (ComexMensal, ComexPorProduto, ComexPorPais):
            db.query(model).filter(model.municipio_id == mid, model.ano.in_(anos)).delete(
                synchronize_session=False
            )
        for (m_id, ano, mes, tipo), tot in mensal.items():
            if m_id == mid:
                db.add(ComexMensal(municipio_id=mid, ano=ano, mes=mes, tipo_operacao=tipo, **tot))
                resumo.linhas += 1
        for (m_id, ano, tipo, sh4), tot in por_produto.items():
            if m_id == mid:
                rotulo = f"{sh4} — {nome_sh4.get(sh4, '')}".strip(" —")[:300]
                db.add(ComexPorProduto(municipio_id=mid, ano=ano, tipo_operacao=tipo, produto=rotulo, **tot))
                resumo.linhas += 1
        for (m_id, ano, tipo, pais), tot in por_pais.items():
            if m_id == mid:
                db.add(ComexPorPais(municipio_id=mid, ano=ano, tipo_operacao=tipo,
                                    pais=nome_pais.get(pais, pais)[:150], **tot))
                resumo.linhas += 1
        db.commit()
        resumo.municipios_ok += 1
        # município sem linha = sem comércio exterior (zero é dado, não erro)
    return resumo


registrar(FonteAutomatica(
    key="comex",
    label="Comércio Exterior (Comex Stat/MDIC)",
    fonte="MDIC — Comex Stat, exportações e importações por município (CSVs anuais MUN)",
    executar=executar,
))
```

- [ ] **Step 5: Registrar no `__init__.py`, rodar testes e commitar**

```python
from app.services.ingestao_automatica import comex_mdic  # noqa: F401
```

Run: `venv\Scripts\python -m pytest backend/tests -q`
Expected: tudo verde

```bash
git add backend/app/services/ingestao_automatica/comex_mdic.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_comex_mdic.py
git commit -m "feat(ingestao): fonte automatica do Comex (MDIC Comex Stat)"
```

**Nota de performance (aceita no design):** o loop de escrita percorre os dicts agregados uma vez por município — O(municípios × chaves). Para execução nacional, se ficar lento, otimizar agrupando por `mid` antes do loop (mesma técnica do `captacao_siconv.py:190-196`). Não otimizar antecipadamente para os casos de 1 UF.

---

### Task 9: Fonte `estban_bcb`

**Files:**
- Create: `backend/app/services/ingestao_automatica/estban_bcb.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py`
- Test: `backend/tests/test_estban_bcb.py`

**Interfaces:**
- Consumes: `norm_nome_municipio`, `competencias_janela`, `baixar_zip`, `linhas_zip`, base.
- Produces: fonte key `"estban"`; `parse_estban_agencia(linhas, alvo) -> dict` com agregados município e instituição para UMA competência.

**Fonte de dados:** Bacen ESTBAN, arquivo mensal **por agência** — `https://www4.bcb.gov.br/fis/cosif/cont/estban/agencia/{AAAAMM}_ESTBAN_AGENCIA.ZIP` (CSV latin-1, `;`, com linhas de preâmbulo antes do header `#DATA_BASE;...`). Cada linha é uma agência; agregamos por município (→ `estban_mensal`, `qtd_agencias` = nº de linhas) e por (município, instituição) (→ `estban_por_instituicao`). Publicação com ~3 meses de defasagem.

**Mapeamento de verbetes → colunas do model** (o header real é a fonte da verdade — Step 1):

| Coluna model | Conceito ESTBAN (verbete) |
|---|---|
| valor_operacoes_credito | 160 — Operações de crédito (total) |
| valor_depositos_vista | 420 (depósitos à vista — somar os verbetes 4xx de depósitos à vista se vierem separados por titular) |
| valor_poupanca | 432 — Depósitos de poupança |
| valor_depositos_prazo | 430 — Depósitos a prazo (ou verbete equivalente no header) |
| emprestimos_titulos_descontados | 161 — Empréstimos e títulos descontados |
| financiamentos_gerais | 162 — Financiamentos |
| financiamento_agropecuario | 163+164+165 (rurais: agricultura/pecuária/agroindustrial) |
| financiamentos_imobiliarios | 169 — Financiamentos imobiliários |
| arrendamento_mercantil | 171 — Arrendamento mercantil (se presente) |
| emprestimos_setor_publico | 172/173 — Setor público (se presente) |
| outros_creditos | 176 — Outros créditos (se presente) |

- [ ] **Step 1: Capturar o header real e ancorar as constantes**

```bash
curl -s -o estban_amostra.zip "https://www4.bcb.gov.br/fis/cosif/cont/estban/agencia/202603_ESTBAN_AGENCIA.ZIP"
venv\Scripts\python -c "import zipfile,io; z=zipfile.ZipFile('estban_amostra.zip'); f=z.open(z.namelist()[0]); [print(io.TextIOWrapper(f,encoding='latin-1').readline()) for _ in range(4)]"
```

Expected: linhas de preâmbulo + header começando com `#DATA_BASE` contendo `NOME_INSTITUICAO`, `MUNICIPIO`, `UF` (ou `SIGLA_UF`) e colunas `VERBETE_xxx_...`. **Copie os nomes EXATOS das colunas de verbete** para a constante `MAPA_VERBETES` do Step 4 seguindo a tabela de conceitos acima (o nome no header inclui o número — ex.: `VERBETE_160_OPERACOES_DE_CREDITO`). Anote também o nome exato das colunas de município/UF. Apague `estban_amostra.zip` ao final. **Validação de valores:** após implementar, comparar 1 competência de Divinópolis com a linha correspondente em `estban_mensal` no banco (valores do ESTBAN são em milhares? conferir a ordem de grandeza contra o legado e, se preciso, multiplicar — registrar a decisão no docstring).

- [ ] **Step 2: Write the failing test** (fixture com os nomes capturados no Step 1 — o exemplo abaixo usa os nomes esperados; substitua pelos reais)

```python
# backend/tests/test_estban_bcb.py
"""Parser puro do ESTBAN por agência (Bacen) — sem rede, sem DB.
Fixture recortada do CSV real AAAAMM_ESTBAN_AGENCIA (2026-03)."""
import io

from app.services.ingestao_automatica.estban_bcb import parse_estban_agencia

CSV = io.StringIO(
    "ESTBAN - Estatística Bancária por agência\n"
    "Data-base: 03/2026\n"
    "#DATA_BASE;CNPJ;NOME_INSTITUICAO;AGENCIA;MUNICIPIO;UF;"
    "VERBETE_160_OPERACOES_DE_CREDITO;VERBETE_161_EMPRESTIMOS_E_TITULOS_DESCONTADOS;"
    "VERBETE_420_DEPOSITOS_A_VISTA;VERBETE_432_DEPOSITOS_DE_POUPANCA\n"
    "202603;00000000;BCO BRASIL;1234;DIVINOPOLIS;MG;1000,50;600,00;300,00;200,00\n"
    "202603;00000000;BCO BRASIL;5678;DIVINOPOLIS;MG;500,00;100,00;100,00;50,00\n"
    "202603;11111111;CAIXA;9999;DIVINOPOLIS;MG;2000,00;900,00;700,00;400,00\n"
    "202603;00000000;BCO BRASIL;1111;OUTRA CIDADE;SP;9,99;9,99;9,99;9,99\n"
)


def test_parse_estban_agrega_municipio_e_instituicao():
    out = parse_estban_agencia(CSV, {("divinopolis", "MG"): 42})
    mun = out["municipio"][42]
    assert mun["qtd_agencias"] == 3
    assert mun["valor_operacoes_credito"] == 3500.50
    assert out["instituicao"][(42, "BCO BRASIL")]["qtd_agencias"] == 2
    assert out["instituicao"][(42, "CAIXA")]["valor_poupanca"] == 400.00
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_estban_bcb.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write the fonte** (ajuste `MAPA_VERBETES` e nomes de coluna com o header do Step 1)

```python
# backend/app/services/ingestao_automatica/estban_bcb.py
"""Fonte automática: ESTBAN por município e instituição (Bacen).

ZIP mensal por AGÊNCIA (uma linha por agência) — agrega por município
(estban_mensal, qtd_agencias = nº de linhas) e por município+instituição
(estban_por_instituicao). O CSV tem preâmbulo antes do header '#DATA_BASE'
(mesma técnica do fpm_stn de procurar a linha do header). Sem código IBGE
no arquivo — match por (nome normalizado, UF). Publicação com ~3 meses de
defasagem: competências 404 recentes não são erro."""
import csv
import logging
import os
import tempfile
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import (
    baixar_zip,
    competencias_janela,
    linhas_zip,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL = "https://www4.bcb.gov.br/fis/cosif/cont/estban/agencia/{anomes}_ESTBAN_AGENCIA.ZIP"
INICIO_SERIE = (2022, 1)

# coluna do model → lista de colunas de verbete do CSV (somadas)
# NOMES CONFERIDOS contra o header real em 2026-07 (Step 1 do plano).
MAPA_VERBETES = {
    "valor_operacoes_credito": ["VERBETE_160_OPERACOES_DE_CREDITO"],
    "valor_depositos_vista": ["VERBETE_420_DEPOSITOS_A_VISTA"],
    "valor_poupanca": ["VERBETE_432_DEPOSITOS_DE_POUPANCA"],
    "valor_depositos_prazo": ["VERBETE_430_DEPOSITOS_A_PRAZO"],
    "emprestimos_titulos_descontados": ["VERBETE_161_EMPRESTIMOS_E_TITULOS_DESCONTADOS"],
    "financiamentos_gerais": ["VERBETE_162_FINANCIAMENTOS"],
    "financiamento_agropecuario": [
        "VERBETE_163_FINANCIAMENTOS_RURAIS_AGRICULTURA",
        "VERBETE_164_FINANCIAMENTOS_RURAIS_PECUARIA",
    ],
    "financiamentos_imobiliarios": ["VERBETE_169_FINANCIAMENTOS_IMOBILIARIOS"],
    "arrendamento_mercantil": ["VERBETE_171_ARRENDAMENTO_MERCANTIL"],
    "emprestimos_setor_publico": ["VERBETE_172_EMPRESTIMOS_SETOR_PUBLICO"],
    "outros_creditos": ["VERBETE_176_OUTROS_CREDITOS"],
}
_ZERO = {coluna: 0.0 for coluna in MAPA_VERBETES}


def parse_estban_agencia(linhas, alvo: dict[tuple[str, str], int]) -> dict:
    """CSV por agência de UMA competência → {"municipio": {mid: totais},
    "instituicao": {(mid, nome): totais}}. `alvo` = {(nome_norm, UF): mid}."""
    reader = csv.reader(linhas, delimiter=";")
    header = None
    for row in reader:
        if row and row[0].strip().upper().startswith("#DATA_BASE"):
            header = [c.strip() for c in row]
            break
    if header is None:
        raise ValueError("ESTBAN sem header #DATA_BASE — layout mudou?")
    idx = {c: i for i, c in enumerate(header)}
    for obrig in ("NOME_INSTITUICAO", "MUNICIPIO", "UF"):
        if obrig not in idx:
            raise ValueError(f"ESTBAN: coluna {obrig} ausente — layout mudou?")
    col_verbetes = {
        coluna: [idx[v] for v in verbetes if v in idx]
        for coluna, verbetes in MAPA_VERBETES.items()
    }

    municipio: dict[int, dict] = {}
    instituicao: dict[tuple[int, str], dict] = {}
    for row in reader:
        if len(row) < len(header) - 5:
            continue
        mid = alvo.get((norm_nome_municipio(row[idx["MUNICIPIO"]]), row[idx["UF"]].strip().upper()))
        if mid is None:
            continue
        nome_inst = row[idx["NOME_INSTITUICAO"]].strip()[:150]
        mun = municipio.setdefault(mid, {"qtd_agencias": 0, **_ZERO})
        inst = instituicao.setdefault((mid, nome_inst), {"qtd_agencias": 0, **_ZERO})
        mun["qtd_agencias"] += 1
        inst["qtd_agencias"] += 1
        for coluna, indices in col_verbetes.items():
            soma = sum(parse_valor_br(row[i]) or 0.0 for i in indices if i < len(row))
            mun[coluna] += soma
            inst[coluna] += soma
    return {"municipio": municipio, "instituicao": instituicao}


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.estban import EstbanMensal, EstbanPorInstituicao

    resumo = ResumoIngestao(dataset="estban")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=36)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        data_ref = date(ano, mes, 1)
        if progresso:
            progresso(len(mids_ok), len(alvo), f"ESTBAN {anomes} ({i}/{len(competencias)})")
        with tempfile.TemporaryDirectory(prefix="estban_") as pasta:
            try:
                caminho = baixar_zip(URL.format(anomes=anomes), os.path.join(pasta, "estban.zip"))
            except requests.RequestException as exc:
                # meses recentes ainda não publicados retornam erro — informação, não falha
                resumo.erros.append(f"ESTBAN {anomes}: indisponível ({exc})")
                continue
            with linhas_zip(caminho, encoding="latin-1") as linhas:
                parsed = parse_estban_agencia(linhas, alvo)

        for mid, totais in parsed["municipio"].items():
            reg = (
                db.query(EstbanMensal)
                .filter(EstbanMensal.municipio_id == mid, EstbanMensal.data_referencia == data_ref)
                .first()
            )
            if reg:
                for coluna, valor in totais.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(EstbanMensal(municipio_id=mid, data_referencia=data_ref, **totais))
            resumo.linhas += 1
            mids_ok.add(mid)
        # instituições: REPLACE por (município, competência) — bancos fecham agências
        mids_da_competencia = sorted({k[0] for k in parsed["instituicao"]})
        if mids_da_competencia:
            db.query(EstbanPorInstituicao).filter(
                EstbanPorInstituicao.municipio_id.in_(mids_da_competencia),
                EstbanPorInstituicao.data_referencia == data_ref,
            ).delete(synchronize_session=False)
        for (mid, nome_inst), totais in parsed["instituicao"].items():
            db.add(EstbanPorInstituicao(
                municipio_id=mid, data_referencia=data_ref, nome_instituicao=nome_inst, **totais
            ))
            resumo.linhas += 1
        db.commit()

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: sem agências no ESTBAN na janela")
    return resumo


registrar(FonteAutomatica(
    key="estban",
    label="ESTBAN — estatística bancária (Bacen)",
    fonte="Banco Central — ESTBAN por agência, agregado por município e instituição",
    executar=executar,
))
```

- [ ] **Step 5: Registrar no `__init__.py`, rodar testes e commitar**

```python
from app.services.ingestao_automatica import estban_bcb  # noqa: F401
```

Run: `venv\Scripts\python -m pytest backend/tests -q`
Expected: tudo verde

```bash
git add backend/app/services/ingestao_automatica/estban_bcb.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_estban_bcb.py
git commit -m "feat(ingestao): fonte automatica do ESTBAN (Bacen, por agencia)"
```

---

### Task 10: Fonte `bolsa_familia_portal`

**Files:**
- Create: `backend/app/services/ingestao_automatica/bolsa_familia_portal.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py`
- Test: `backend/tests/test_bolsa_familia_portal.py`

**Interfaces:**
- Consumes: `norm_nome_municipio`, `competencias_janela`, `baixar_zip`, `linhas_zip`, `parse_valor_br`, `indices_colunas`, base.
- Produces: fonte key `"bolsa_familia"`; `parse_bolsa_familia_csv(linhas, alvo, eh_novo_bolsa) -> dict[int, dict]` (agregado de UMA competência por município); `calcular_primeira_infancia(valor) -> float`.

**Fonte de dados:** Portal da Transparência — ZIPs mensais nacionais (latin-1, `;`, 1 linha por parcela/NIS): Auxílio Brasil (`/download-de-dados/auxilio-brasil/{AAAAMM}`, 202201–202302) e Novo Bolsa Família (`/download-de-dados/novo-bolsa-familia/{AAAAMM}`, 202303+). Colunas usadas: `MÊS COMPETÊNCIA`, `UF`, `NOME MUNICÍPIO`, `VALOR PARCELA` (sem código IBGE — match nome+UF). Regra da primeira infância (só Novo Bolsa Família, portada de `coleta.py:172-188`): `pi = int((v - 600) // 150) * 150.0 if v > 600 else 0.0`. **Arquivos grandes** (zip de centenas de MB) — streaming obrigatório, nunca materializar o CSV.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_bolsa_familia_portal.py
"""Parser puro do Bolsa Família (Portal da Transparência) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.bolsa_familia_portal import (
    calcular_primeira_infancia,
    parse_bolsa_familia_csv,
)

CSV = io.StringIO(
    "MÊS COMPETÊNCIA;MÊS REFERÊNCIA;UF;CÓDIGO MUNICÍPIO SIAFI;NOME MUNICÍPIO;NIS FAVORECIDO;VALOR PARCELA\n"
    "202605;202605;MG;4771;DIVINOPOLIS;123;600,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;456;900,00\n"     # 900 → PI=300, bolsa=600
    "202605;202605;SP;7107;SAO PAULO;789;650,00\n"        # fora do alvo
)


def test_calcular_primeira_infancia_regra_novo_bolsa():
    assert calcular_primeira_infancia(600.0) == 0.0
    assert calcular_primeira_infancia(900.0) == 300.0
    assert calcular_primeira_infancia(760.0) == 150.0   # (760-600)//150*150


def test_parse_bolsa_agrega_por_municipio():
    out = parse_bolsa_familia_csv(CSV, {("divinopolis", "MG"): 42}, eh_novo_bolsa=True)
    assert set(out) == {42}
    assert out[42]["total_beneficiarios"] == 2
    assert out[42]["valor_total"] == 1500.0
    assert out[42]["valor_primeira_infancia"] == 300.0
    assert out[42]["valor_bolsa"] == 1200.0
    assert out[42]["beneficiarios_primeira_infancia"] == 1


def test_parse_bolsa_auxilio_brasil_sem_primeira_infancia():
    csv2 = io.StringIO(
        "MÊS COMPETÊNCIA;UF;NOME MUNICÍPIO;VALOR PARCELA\n"
        "202207;MG;DIVINOPOLIS;900,00\n"
    )
    out = parse_bolsa_familia_csv(csv2, {("divinopolis", "MG"): 42}, eh_novo_bolsa=False)
    assert out[42]["valor_primeira_infancia"] == 0.0
    assert out[42]["valor_bolsa"] == 900.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_bolsa_familia_portal.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write the fonte**

```python
# backend/app/services/ingestao_automatica/bolsa_familia_portal.py
"""Fonte automática: Bolsa Família / Auxílio Brasil por município (Portal da
Transparência).

ZIP mensal NACIONAL com 1 linha por parcela/NIS (latin-1, ';') — centenas de
MB; o parse é streaming e só acumula agregados dos municípios-alvo. Sem
código IBGE no arquivo — match (nome normalizado, UF). Regra da primeira
infância portada de coleta.py: só no Novo Bolsa Família (>= 2023-03).
Upsert por (município, competência); reexecução é idempotente."""
import logging
import os
import tempfile
from datetime import date

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import (
    baixar_zip,
    competencias_janela,
    indices_colunas,
    linhas_zip,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL_AUXILIO_BRASIL = "https://portaldatransparencia.gov.br/download-de-dados/auxilio-brasil/{anomes}"
URL_NOVO_BOLSA = "https://portaldatransparencia.gov.br/download-de-dados/novo-bolsa-familia/{anomes}"
INICIO_SERIE = (2022, 1)
INICIO_NOVO_BOLSA = (2023, 3)

_COLS = ["MÊS COMPETÊNCIA", "UF", "NOME MUNICÍPIO", "VALOR PARCELA"]


def calcular_primeira_infancia(valor: float) -> float:
    """Benefício Primeira Infância embutido na parcela (coleta.py:172-181):
    acima de R$600, o excedente em múltiplos de R$150."""
    return int((valor - 600) // 150) * 150.0 if valor > 600 else 0.0


def parse_bolsa_familia_csv(linhas, alvo: dict[tuple[str, str], int], eh_novo_bolsa: bool) -> dict[int, dict]:
    """CSV de UMA competência → {mid: agregado BolsaFamiliaResumo (sem
    municipio_id/ano/mes)}. Streaming: uma linha por vez."""
    import csv

    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV do Bolsa Família vazio")
    idx = indices_colunas([c.strip() for c in header], _COLS, "bolsa_familia")

    out: dict[int, dict] = {}
    for row in reader:
        try:
            mid = alvo.get((norm_nome_municipio(row[idx["NOME MUNICÍPIO"]]), row[idx["UF"]].strip().upper()))
            if mid is None:
                continue
            valor = parse_valor_br(row[idx["VALOR PARCELA"]]) or 0.0
        except IndexError:
            continue
        agg = out.setdefault(mid, {
            "total_beneficiarios": 0, "valor_total": 0.0, "valor_bolsa": 0.0,
            "valor_primeira_infancia": 0.0, "beneficiarios_primeira_infancia": 0,
        })
        pi = calcular_primeira_infancia(valor) if eh_novo_bolsa else 0.0
        agg["total_beneficiarios"] += 1
        agg["valor_total"] += valor
        agg["valor_primeira_infancia"] += pi
        agg["valor_bolsa"] += valor - pi
        if pi > 0:
            agg["beneficiarios_primeira_infancia"] += 1
    return out


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.bolsa_familia import BolsaFamiliaResumo

    resumo = ResumoIngestao(dataset="bolsa_familia")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=12)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        eh_novo = (ano, mes) >= INICIO_NOVO_BOLSA
        url = (URL_NOVO_BOLSA if eh_novo else URL_AUXILIO_BRASIL).format(anomes=anomes)
        if progresso:
            progresso(len(mids_ok), len(alvo), f"baixando {anomes} ({i}/{len(competencias)})")
        with tempfile.TemporaryDirectory(prefix="bf_") as pasta:
            try:
                caminho = baixar_zip(url, os.path.join(pasta, "bf.zip"))
                with linhas_zip(caminho, encoding="latin-1") as linhas:
                    por_mid = parse_bolsa_familia_csv(linhas, alvo, eh_novo)
            except requests.RequestException as exc:
                resumo.erros.append(f"Bolsa Família {anomes}: indisponível ({exc})")
                continue

        for mid, agg in por_mid.items():
            agg = {k: round(v, 2) if isinstance(v, float) else v for k, v in agg.items()}
            reg = (
                db.query(BolsaFamiliaResumo)
                .filter(BolsaFamiliaResumo.municipio_id == mid,
                        BolsaFamiliaResumo.ano == ano, BolsaFamiliaResumo.mes == mes)
                .first()
            )
            if reg:
                for coluna, valor in agg.items():
                    setattr(reg, coluna, valor)
            else:
                db.add(BolsaFamiliaResumo(municipio_id=mid, ano=ano, mes=mes, **agg))
            resumo.linhas += 1
            mids_ok.add(mid)
        db.commit()
        if progresso:
            progresso(len(mids_ok), len(alvo), f"{anomes} gravado")

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos CSVs do Portal")
    return resumo


registrar(FonteAutomatica(
    key="bolsa_familia",
    label="Bolsa Família (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — parcelas do Novo Bolsa Família e Auxílio Brasil, agregadas por município",
    executar=executar,
))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `venv\Scripts\python -m pytest backend/tests/test_bolsa_familia_portal.py backend/tests -q`
Expected: tudo verde

- [ ] **Step 5: Registrar no `__init__.py` e commitar**

```python
from app.services.ingestao_automatica import bolsa_familia_portal  # noqa: F401
```

```bash
git add backend/app/services/ingestao_automatica/bolsa_familia_portal.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_bolsa_familia_portal.py
git commit -m "feat(ingestao): fonte automatica do Bolsa Familia (Portal da Transparencia)"
```

**Nota operacional:** default de 12 competências ≈ 12 downloads de centenas de MB — execução de ~30-60 min. É exatamente o caso de uso do job em background; para carga histórica completa (2022+), rodar com `anos=[2022]`, depois `[2023]`, etc.

---

### Task 11: Fonte `pe_de_meia_portal`

**Files:**
- Create: `backend/app/services/ingestao_automatica/pe_de_meia_portal.py`
- Modify: `backend/app/services/ingestao_automatica/__init__.py`
- Test: `backend/tests/test_pe_de_meia_portal.py`

**Interfaces:**
- Consumes: mesmos utils do Task 10.
- Produces: fonte key `"pe_de_meia"`; `parse_pe_de_meia_csv(linhas, alvo) -> dict` com `{"resumo": {mid: agg}, "etapa": {(mid, etapa, tipo): agg}}` de UMA competência.

**Fonte de dados:** Portal da Transparência — `/download-de-dados/pe-de-meia/{AAAAMM}` desde 2024-01 (ZIP mensal nacional, latin-1, `;`, 1 linha por beneficiário). Colunas usadas (GUIA §11): `MÊS REFERÊNCIA`, `UF`, `NOME MUNICÍPIO`, `ETAPA ENSINO`, `TIPO INCENTIVO`, `VALOR PARCELA`. Match nome+UF.

- [ ] **Step 1: Capturar o header real (colunas UF/município no arquivo nacional)**

```bash
curl -s -o pm_amostra.zip "https://portaldatransparencia.gov.br/download-de-dados/pe-de-meia/202605"
venv\Scripts\python -c "import zipfile,io; z=zipfile.ZipFile('pm_amostra.zip'); f=z.open(z.namelist()[0]); print(io.TextIOWrapper(f,encoding='latin-1').readline())"
```

Expected: header contendo `MÊS REFERÊNCIA`, `UF`, `NOME MUNICÍPIO`, `ETAPA ENSINO`, `TIPO INCENTIVO`, `VALOR PARCELA` (nomes exatos podem variar em caixa/acentos — ajuste `_COLS` abaixo e a fixture com o header real). Apague `pm_amostra.zip` ao final.

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_pe_de_meia_portal.py
"""Parser puro do Pé-de-Meia (Portal da Transparência) — sem rede, sem DB."""
import io

from app.services.ingestao_automatica.pe_de_meia_portal import parse_pe_de_meia_csv

CSV = io.StringIO(
    "MÊS COMPETÊNCIA;MÊS REFERÊNCIA;UF;CÓDIGO MUNICÍPIO SIAFI;NOME MUNICÍPIO;NIS BENEFICIÁRIO;"
    "ETAPA ENSINO;TIPO INCENTIVO;VALOR PARCELA\n"
    "202605;202605;MG;4771;DIVINOPOLIS;111;Ensino Médio;Frequência;200,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;222;Ensino Médio;Matrícula;200,00\n"
    "202605;202605;MG;4771;DIVINOPOLIS;333;EJA;Frequência;225,00\n"
    "202605;202605;SP;7107;SAO PAULO;444;Ensino Médio;Frequência;200,00\n"
)


def test_parse_pe_de_meia_agrega_resumo_e_etapa():
    out = parse_pe_de_meia_csv(CSV, {("divinopolis", "MG"): 42})
    assert out["resumo"][42] == {"total_estudantes": 3, "valor_total": 625.0}
    assert out["etapa"][(42, "Ensino Médio", "Frequência")] == {"total_estudantes": 1, "valor_total": 200.0}
    assert out["etapa"][(42, "EJA", "Frequência")]["valor_total"] == 225.0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `venv\Scripts\python -m pytest backend/tests/test_pe_de_meia_portal.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write the fonte**

```python
# backend/app/services/ingestao_automatica/pe_de_meia_portal.py
"""Fonte automática: Pé-de-Meia por município (Portal da Transparência).

ZIP mensal nacional (latin-1, ';'), 1 linha por beneficiário, desde 2024-01.
Parse streaming agregando só os municípios-alvo (match nome+UF). Resumo:
upsert por (município, competência). Etapas: REPLACE por (município,
competência) — combinações (etapa, incentivo) mudam entre meses."""
import csv
import logging
import os
import tempfile

import requests

from app.services.ingestao_automatica.base import FonteAutomatica, ResumoIngestao, registrar
from app.services.ingestao_automatica.util import (
    baixar_zip,
    competencias_janela,
    indices_colunas,
    linhas_zip,
    norm_nome_municipio,
    parse_valor_br,
)

logger = logging.getLogger(__name__)

URL = "https://portaldatransparencia.gov.br/download-de-dados/pe-de-meia/{anomes}"
INICIO_SERIE = (2024, 1)

_COLS = ["MÊS REFERÊNCIA", "UF", "NOME MUNICÍPIO", "ETAPA ENSINO", "TIPO INCENTIVO", "VALOR PARCELA"]


def parse_pe_de_meia_csv(linhas, alvo: dict[tuple[str, str], int]) -> dict:
    """CSV de UMA competência → {"resumo": {mid: agg}, "etapa": {(mid, etapa,
    tipo): agg}}, agg = {total_estudantes, valor_total}."""
    reader = csv.reader(linhas, delimiter=";")
    header = next(reader, None)
    if header is None:
        raise ValueError("CSV do Pé-de-Meia vazio")
    idx = indices_colunas([c.strip() for c in header], _COLS, "pe_de_meia")

    resumo: dict[int, dict] = {}
    etapa: dict[tuple, dict] = {}
    for row in reader:
        try:
            mid = alvo.get((norm_nome_municipio(row[idx["NOME MUNICÍPIO"]]), row[idx["UF"]].strip().upper()))
            if mid is None:
                continue
            valor = parse_valor_br(row[idx["VALOR PARCELA"]]) or 0.0
            nome_etapa = row[idx["ETAPA ENSINO"]].strip()[:150]
            tipo = row[idx["TIPO INCENTIVO"]].strip()[:100]
        except IndexError:
            continue
        r = resumo.setdefault(mid, {"total_estudantes": 0, "valor_total": 0.0})
        r["total_estudantes"] += 1
        r["valor_total"] += valor
        e = etapa.setdefault((mid, nome_etapa, tipo), {"total_estudantes": 0, "valor_total": 0.0})
        e["total_estudantes"] += 1
        e["valor_total"] += valor
    return {"resumo": resumo, "etapa": etapa}


def executar(db, municipios, anos=None, usuario_id=None, notificar=True, progresso=None) -> ResumoIngestao:
    from app.models.pe_de_meia import PeDeMeiaEtapa, PeDeMeiaResumo

    resumo = ResumoIngestao(dataset="pe_de_meia")
    alvo = {(norm_nome_municipio(m.nome), m.estado.upper()): m.id for m in municipios}
    if not alvo:
        return resumo

    competencias = competencias_janela(anos=anos, inicio=INICIO_SERIE, meses_default=12)
    mids_ok: set[int] = set()
    for i, (ano, mes) in enumerate(competencias, start=1):
        anomes = f"{ano}{mes:02d}"
        if progresso:
            progresso(len(mids_ok), len(alvo), f"baixando {anomes} ({i}/{len(competencias)})")
        with tempfile.TemporaryDirectory(prefix="pm_") as pasta:
            try:
                caminho = baixar_zip(URL.format(anomes=anomes), os.path.join(pasta, "pm.zip"))
                with linhas_zip(caminho, encoding="latin-1") as linhas:
                    parsed = parse_pe_de_meia_csv(linhas, alvo)
            except requests.RequestException as exc:
                resumo.erros.append(f"Pé-de-Meia {anomes}: indisponível ({exc})")
                continue

        for mid, agg in parsed["resumo"].items():
            agg = {"total_estudantes": agg["total_estudantes"], "valor_total": round(agg["valor_total"], 2)}
            reg = (
                db.query(PeDeMeiaResumo)
                .filter(PeDeMeiaResumo.municipio_id == mid,
                        PeDeMeiaResumo.ano == ano, PeDeMeiaResumo.mes == mes)
                .first()
            )
            if reg:
                reg.total_estudantes = agg["total_estudantes"]
                reg.valor_total = agg["valor_total"]
            else:
                db.add(PeDeMeiaResumo(municipio_id=mid, ano=ano, mes=mes, **agg))
            resumo.linhas += 1
            mids_ok.add(mid)

        mids_da_competencia = list({k[0] for k in parsed["etapa"]})
        if mids_da_competencia:
            db.query(PeDeMeiaEtapa).filter(
                PeDeMeiaEtapa.municipio_id.in_(mids_da_competencia),
                PeDeMeiaEtapa.ano == ano, PeDeMeiaEtapa.mes == mes,
            ).delete(synchronize_session=False)
        for (mid, nome_etapa, tipo), agg in parsed["etapa"].items():
            db.add(PeDeMeiaEtapa(
                municipio_id=mid, ano=ano, mes=mes, etapa_ensino=nome_etapa,
                tipo_incentivo=tipo, total_estudantes=agg["total_estudantes"],
                valor_total=round(agg["valor_total"], 2),
            ))
            resumo.linhas += 1
        db.commit()

    resumo.municipios_ok = len(mids_ok)
    faltantes = set(alvo.values()) - mids_ok
    resumo.municipios_erro += len(faltantes)
    if faltantes:
        nomes = {mid: f"{nome}/{uf}" for (nome, uf), mid in alvo.items()}
        for mid in sorted(faltantes):
            resumo.erros.append(f"{nomes.get(mid, mid)}: não encontrado nos CSVs do Portal")
    return resumo


registrar(FonteAutomatica(
    key="pe_de_meia",
    label="Pé-de-Meia (Portal da Transparência)",
    fonte="Portal da Transparência/CGU — parcelas do Pé-de-Meia por beneficiário, agregadas por município",
    executar=executar,
))
```

- [ ] **Step 5: Registrar no `__init__.py`, rodar testes e commitar**

```python
from app.services.ingestao_automatica import pe_de_meia_portal  # noqa: F401
```

Run: `venv\Scripts\python -m pytest backend/tests tests -q`
Expected: tudo verde

```bash
git add backend/app/services/ingestao_automatica/pe_de_meia_portal.py backend/app/services/ingestao_automatica/__init__.py backend/tests/test_pe_de_meia_portal.py
git commit -m "feat(ingestao): fonte automatica do Pe-de-Meia (Portal da Transparencia)"
```

---

### Task 12: Frontend — `/admin/fontes` com polling, multi-município e histórico

**Files:**
- Modify: `frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx` (reescrita da seção de fontes automáticas)

**Interfaces:**
- Consumes: `GET /ingestao-automatica/fontes` → `{fontes, job_ativo}`; `POST /{key}/executar` → 202 `{job_id}` (409 quando há job ativo); `GET /jobs/{id}`; `GET /jobs?limit=10`; `GET /municipios` (lista com `id, nome, estado`); componente `MunicipioPicker` (`components/nid/MunicipioPicker.jsx`, single-select — o multi é chips na página).

Comportamento:
- POST → guarda `jobId` → polling `GET /jobs/{id}` a cada 3s enquanto status ∈ {pendente, executando}. Job terminou → toast com resumo, recarrega fontes + histórico, para o polling.
- Ao montar: se `job_ativo` veio no `GET /fontes`, retoma o polling dele (sobrevive a refresh).
- Job ativo (de qualquer fonte) desabilita todos os botões Executar (espelha trava do backend); 409 vira toast de erro.
- Multi-município: `MunicipioPicker` adiciona a uma lista de chips (sem duplicar); X remove. Anos: input texto "2024, 2025" → `[2024, 2025]`.
- Aviso extra fixo para `captacao_federal`: "o diagnóstico de pares pressupõe a UF inteira — prefira o filtro de estado".
- Histórico: tabela com dataset, status, progresso, linhas, quando, duração e preview de erros (2 primeiros do `resumo.erros`).

- [ ] **Step 1: Reescrever o componente**

Substitua o conteúdo de `DatasetFontesAdminPage.jsx` inteiro por:

```jsx
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import MunicipioPicker from "../../components/nid/MunicipioPicker";

const ESTADOS_UF = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const JOB_ATIVO = ["pendente", "executando"];

function labelStatus(status) {
  return {
    pendente: "Na fila", executando: "Executando", concluido: "Concluído",
    erro: "Erro", abortado: "Abortado",
  }[status] || status;
}

function duracao(job) {
  if (!job?.iniciado_em || !job?.finalizado_em) return "—";
  const s = Math.round((new Date(job.finalizado_em) - new Date(job.iniciado_em)) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}`;
}

/**
 * ADMIN_GLOBAL page: metadados de fonte por dataset + esteira de fontes
 * automáticas com execução em background (job + polling de progresso).
 */
export default function DatasetFontesAdminPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [autoFontes, setAutoFontes] = useState([]);
  const [notificar, setNotificar] = useState(true);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [municipios, setMunicipios] = useState([]);
  const [municipiosSel, setMunicipiosSel] = useState([]); // [{id, nome, estado}]
  const [anosText, setAnosText] = useState("");
  const [job, setJob] = useState(null);          // job ativo (polled)
  const [historico, setHistorico] = useState([]);
  const pollRef = useRef(null);

  const jobAtivo = job && JOB_ATIVO.includes(job.status);

  useEffect(() => {
    Promise.all([api.get("/municipios/datasets"), api.get("/dataset-info/all")])
      .then(([catalogRes, infoRes]) => {
        const infoByKey = Object.fromEntries(
          (infoRes.data || []).map((i) => [i.dataset, i])
        );
        setRows((catalogRes.data || []).map((d) => {
          const info = infoByKey[d.key] || {};
          return {
            key: d.key, label: d.label,
            fonte: info.fonte || "",
            data_atualizacao: info.data_atualizacao || "",
          };
        }));
      })
      .catch(() => addToast("Erro ao carregar fontes de dados.", "error"))
      .finally(() => setLoading(false));
    api.get("/municipios").then((r) => setMunicipios(r.data || [])).catch(() => {});
    loadAutoFontes();
    loadHistorico();
    return () => clearInterval(pollRef.current);
  }, []);

  const loadAutoFontes = () =>
    api.get("/ingestao-automatica/fontes")
      .then((r) => {
        setAutoFontes(r.data?.fontes || []);
        if (r.data?.job_ativo) startPolling(r.data.job_ativo);
      })
      .catch(() => {});

  const loadHistorico = () =>
    api.get("/ingestao-automatica/jobs", { params: { limit: 10 } })
      .then((r) => setHistorico(r.data || []))
      .catch(() => {});

  const startPolling = (jobInicial) => {
    setJob(jobInicial);
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/ingestao-automatica/jobs/${jobInicial.id}`);
        setJob(data);
        if (!JOB_ATIVO.includes(data.status)) {
          clearInterval(pollRef.current);
          const r = data.resumo || {};
          if (data.status === "concluido") {
            addToast(
              `${data.dataset}: ${r.municipios_ok ?? 0} município(s), ${r.linhas ?? 0} linha(s)` +
                (r.notificacoes ? `, ${r.notificacoes} notificação(ões)` : "") +
                (r.municipios_erro ? ` — ${r.municipios_erro} com erro` : ""),
              r.municipios_erro ? "warning" : "success"
            );
          } else {
            addToast(`${data.dataset}: ${labelStatus(data.status)} — ${data.erro || "sem detalhe"}`, "error");
          }
          setJob(null);
          loadAutoFontes();
          loadHistorico();
        }
      } catch {
        /* mantém polling; erro transitório de rede */
      }
    }, 3000);
  };

  const handleExecutar = async (fonte) => {
    try {
      const body = {
        notificar,
        ...(estadoFiltro ? { estado: estadoFiltro } : {}),
        ...(municipiosSel.length ? { municipio_ids: municipiosSel.map((m) => m.id) } : {}),
      };
      const anos = anosText.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (anos.length) body.anos = anos;
      const { data } = await api.post(`/ingestao-automatica/${fonte.key}/executar`, body);
      addToast(`${fonte.label}: execução iniciada em segundo plano.`, "success");
      startPolling({ id: data.job_id, dataset: fonte.key, status: "pendente" });
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao iniciar a execução.", "error");
    }
  };

  const addMunicipio = (idStr) => {
    if (!idStr) return;
    const m = municipios.find((x) => String(x.id) === String(idStr));
    if (m && !municipiosSel.some((x) => x.id === m.id)) {
      setMunicipiosSel((prev) => [...prev, m]);
    }
  };

  const updateField = (key, field, value) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const handleSave = async (row) => {
    setSavingKey(row.key);
    try {
      await api.put(`/dataset-info/${row.key}`, {
        fonte: row.fonte, data_atualizacao: row.data_atualizacao,
      });
      addToast(`Fonte de "${row.label}" salva.`, "success");
    } catch (err) {
      addToast(err.response?.data?.detail || "Erro ao salvar.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleClear = async (row) => {
    if (!confirm(`Limpar fonte e data de atualização de "${row.label}"?`)) return;
    setSavingKey(row.key);
    try {
      await api.delete(`/dataset-info/${row.key}`);
      updateField(row.key, "fonte", "");
      updateField(row.key, "data_atualizacao", "");
      addToast(`Fonte de "${row.label}" removida.`, "success");
    } catch (err) {
      if (err.response?.status === 404) {
        updateField(row.key, "fonte", "");
        updateField(row.key, "data_atualizacao", "");
      } else {
        addToast(err.response?.data?.detail || "Erro ao remover.", "error");
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Fontes de Dados
        </h1>
        <p className="text-sm text-[var(--text-mute)] mt-1">
          Defina a fonte e a data de atualização de cada conjunto de dados de
          ingestão. Essas informações aparecem como tooltip nas páginas de dados.
        </p>
      </div>

      {autoFontes.length > 0 && (
        <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm p-5 space-y-4">
          <div className="space-y-3">
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
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                Estado
                <select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
                >
                  <option value="">Todos os estados</option>
                  {ESTADOS_UF.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2 text-sm text-[var(--text-dim)] min-w-[260px]">
                Municípios
                <div className="flex-1">
                  <MunicipioPicker
                    municipios={municipios}
                    value=""
                    onChange={addMunicipio}
                    placeholder="Adicionar município…"
                    ariaLabel="Adicionar município ao filtro"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                Anos
                <input
                  value={anosText}
                  onChange={(e) => setAnosText(e.target.value)}
                  placeholder="ex.: 2024, 2025"
                  className="w-32 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} className="rounded" />
                Gerar notificações
              </label>
            </div>
            {municipiosSel.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {municipiosSel.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs text-[var(--text)]">
                    {m.nome} — {m.estado}
                    <button
                      onClick={() => setMunicipiosSel((prev) => prev.filter((x) => x.id !== m.id))}
                      aria-label={`Remover ${m.nome}`}
                      className="text-[var(--text-dim)] hover:text-red-500"
                    >
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {autoFontes.map((f) => {
              const esteRodando = jobAtivo && job.dataset === f.key;
              return (
                <div key={f.key} className="rounded-xl border border-[var(--border)] px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text)]">{f.label}</p>
                      <p className="text-xs text-[var(--text-mute)] truncate">{f.fonte}</p>
                      <p className="text-xs mt-0.5 text-[var(--text-dim)]">
                        {f.ultimo_job
                          ? `Último job: ${new Date(f.ultimo_job.criado_em).toLocaleString("pt-BR")} · ${labelStatus(f.ultimo_job.status)} · ${f.ultimo_job.resumo?.linhas ?? 0} linhas`
                          : "Nunca executada"}
                      </p>
                      {f.key === "captacao_federal" && (
                        <p className="text-xs mt-0.5 text-amber-500">
                          O diagnóstico de pares compara a UF inteira — prefira o filtro de estado a municípios avulsos.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleExecutar(f)}
                      disabled={jobAtivo}
                      className="px-4 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                      aria-label={`Atualizar ${f.label} agora`}
                    >
                      {esteRodando ? "Executando…" : "Atualizar agora"}
                    </button>
                  </div>
                  {esteRodando && (
                    <div className="space-y-1">
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
                </div>
              );
            })}
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--text)] mb-2">Histórico de execuções</h3>
            {historico.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)]">Nenhuma execução registrada.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--text-dim)]">
                    <th className="py-2 pr-3">Fonte</th>
                    <th className="py-2 pr-3">Quando</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Duração</th>
                    <th className="py-2 pr-3">Linhas</th>
                    <th className="py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((j) => (
                    <tr key={j.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-[var(--text)]">{j.dataset}</td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">
                        {new Date(j.criado_em).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={
                          j.status === "concluido" ? "text-emerald-500" :
                          j.status === "erro" || j.status === "abortado" ? "text-red-500" :
                          "text-amber-500"
                        }>
                          {labelStatus(j.status)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">{duracao(j)}</td>
                      <td className="py-2 pr-3 text-[var(--text-dim)]">{j.resumo?.linhas ?? "—"}</td>
                      <td className="py-2 text-[var(--text-dim)]">
                        {j.erro
                          ? j.erro.slice(0, 120)
                          : (j.resumo?.erros || []).slice(0, 2).join("; ").slice(0, 120) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="bg-[var(--panel)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--text-dim)]">
            Carregando...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Conjunto de dados</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Fonte</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)]">Data de atualização</th>
                <th className="px-4 py-3 font-semibold text-[var(--text-dim)] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--text)] align-middle">
                    {row.label}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.fonte}
                      onChange={(e) => updateField(row.key, "fonte", e.target.value)}
                      placeholder="Ex.: IBGE — SIDRA"
                      maxLength={200}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.data_atualizacao}
                      onChange={(e) => updateField(row.key, "data_atualizacao", e.target.value)}
                      placeholder="Ex.: Março/2026 ou Ano-base 2024"
                      maxLength={60}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSave(row)}
                        disabled={savingKey === row.key}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-50"
                        aria-label={`Salvar fonte de ${row.label}`}
                      >
                        <CheckIcon className="w-4 h-4" />
                        Salvar
                      </button>
                      <button
                        onClick={() => handleClear(row)}
                        disabled={savingKey === row.key || (!row.fonte && !row.data_atualizacao)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--text-dim)] hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40"
                        aria-label={`Limpar fonte de ${row.label}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Build como gate**

```bash
cd frontend-observatorio && npm run build && cd ..
```

Expected: build ok (warnings de eslint baseline são conhecidos e ignoráveis).

- [ ] **Step 3: Commit**

```bash
git add frontend-observatorio/src/pages/admin/DatasetFontesAdminPage.jsx
git commit -m "feat(admin/fontes): execucao em background com progresso, multi-municipio e historico"
```

---

### Task 13: Docs, suíte completa e verificação E2E

**Files:**
- Modify: `README.md` (tabela de fontes — pib, pix, estban, comex, bolsa_familia, pe_de_meia agora automáticos; seção de fontes automáticas ganha os 6 novos)
- Modify: `backend/ingestao/GUIA_AGENTE_GERACAO_CSV.md` (nota no topo das seções 7/8/9/11/12 e Bolsa Família: "este dataset tem fonte automática in-app — o CSV manual é fallback")

- [ ] **Step 1: Atualizar README**

Na tabela de datasets do `README.md:11-29`, marque os 6 como automáticos (mesmo estilo usado hoje para populacao/fpm/captacao/emendas em `README.md:294-297`) e acrescente à seção de fontes automáticas:

```markdown
| pib | IBGE — PIB dos Municípios (agregado 5938) | automática |
| pix | BCB — Estatísticas do PIX (Olinda) | automática |
| estban | BCB — ESTBAN por agência | automática |
| comex | MDIC — Comex Stat (CSVs MUN) | automática |
| bolsa_familia | Portal da Transparência (ZIPs mensais) | automática |
| pe_de_meia | Portal da Transparência (ZIPs mensais) | automática |
```

E documente o fluxo de background: `POST /ingestao-automatica/{key}/executar` → 202 `{job_id}` → `GET /ingestao-automatica/jobs/{id}`; trava global de 1 job; heartbeat/abortado em restart.

- [ ] **Step 2: Nota no GUIA**

No topo de `GUIA_AGENTE_GERACAO_CSV.md`, adicione:

```markdown
> **Fontes automáticas (2026-07):** pib, pix, estban, comex, bolsa_familia e
> pe_de_meia agora têm fonte automática in-app (`app/services/ingestao_automatica/`)
> executada em background pela página /admin/fontes. Os CSVs manuais descritos
> abaixo continuam funcionando como fallback via reingest.
```

- [ ] **Step 3: Suíte completa + build**

```bash
venv\Scripts\python -m pytest backend/tests tests -q
cd frontend-observatorio && npm run build && cd ..
```

Expected: tudo verde nos dois.

- [ ] **Step 4: Verificação E2E real (manual, DB de dev Railway)**

Suba a API local (`cd backend && ..\venv\Scripts\python -m uvicorn app.main:app --port 8000`) e, logado como ADMIN_GLOBAL na UI local:

1. Executar **pib** com município = Divinópolis → job conclui em segundos; conferir `pib_anual` (anos novos REAL, valores em R$ mil compatíveis com os legados).
2. Executar **pix** com município = Divinópolis, anos = [2026] → conferir `pix_mensal` contra a série legada (mesma ordem de grandeza mês a mês).
3. Executar **estban** com município = Divinópolis, anos = [2026] → conferir `estban_mensal`/`estban_por_instituicao` vs legado (ordem de grandeza! ver nota de milhares no Task 9).
4. Executar **comex** com município = Divinópolis, anos = [2025] → conferir os 3 níveis.
5. Executar **bolsa_familia** e **pe_de_meia** com município = Divinópolis (1-2 competências via anos) → conferir resumos vs legado.
6. Testar a trava: disparar 2 jobs seguidos → o 2º recebe 409 com toast.
7. Dar refresh na página durante um job → progresso retoma.

Registrar divergências relevantes no ledger SDD (`.superpowers/sdd/progress.md`).

- [ ] **Step 5: Commit final**

```bash
git add README.md backend/ingestao/GUIA_AGENTE_GERACAO_CSV.md
git commit -m "docs: fontes automaticas dos 6 datasets migrados + fluxo de jobs em background"
```

---

## Fora do escopo (rodadas futuras)

Cancelamento cooperativo de job, agendamento/cron, worker separado (datasets pesados: caged/rais/cnpj), fontes estaduais (arrecadacao/vaf), ips/inss, dados de saúde. A tabela `ingestao_job` e o runner já suportam essas evoluções sem migração.
