# Worker de ingestão separado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executor de ingestão em processo separado (serviço Railway próprio): a API enfileira (`INGESTAO_EXECUTOR=worker`) e o worker reivindica jobs com `FOR UPDATE SKIP LOCKED`, rodando o `_executar_job` existente sem mudança de semântica.

**Architecture:** `app/worker.py` novo (loop de claim + chamada síncrona do `_executar_job` atual); `iniciar_job` ganha um branch no final (worker → não dispara thread); config nova com default `inline` (comportamento atual intacto). Insight-chave: `_executar_job` já re-seta `executando` incondicionalmente (runner.py:259-263), então o claim não exige refactor da execução. Spec: `docs/superpowers/specs/2026-08-03-worker-ingestao-design.md`.

**Tech Stack:** Python 3.11, SQLAlchemy 2.0, FastAPI, PostgreSQL (SKIP LOCKED), Docker/Railway.

## Global Constraints

- **Zero frontend, zero migração de schema, zero dependência nova.**
- Gates por task: `venv/Scripts/python -m pytest backend/tests -q` → exit 0, da raiz do repo. (Suite `tests/` da raiz tem falhas PRÉ-EXISTENTES sem relação — o gate é `backend/tests`.)
- Branch: `feat/worker-ingestao`, criada na Task 1 a partir da `main`.
- WIP do usuário — NÃO commitar: `.claude/settings.local.json`, `dados/`, `docs/superpowers/plans/2026-05-06-ips-feature.md`. `README.md`: conferir `git status` antes — se já estiver modificado antes da sua edição, editar e NÃO commitar (precedente do ciclo captação); se limpo, commitar junto.
- Default `inline` preserva TODO o comportamento atual — nenhum teste existente do runner pode mudar de resultado.
- Testes novos seguem o padrão do repo: `MagicMock` para sessão/queries (como os testes existentes de runner/fontes em `backend/tests/`), sem PG real.

---

## File Map

| File | Action |
|---|---|
| `backend/app/core/config.py` | Modify — `INGESTAO_EXECUTOR: str = "inline"` |
| `backend/app/services/ingestao_automatica/runner.py` | Modify — branch no final de `iniciar_job` |
| `backend/app/worker.py` | Create — loop de claim + execução |
| `backend/tests/test_worker.py` | Create — testes do claim e do enfileirar |
| `docker-compose.yml` | Modify — serviço `worker` + env na api |
| `README.md` | Modify — seção do worker (deploy Railway + rollback) |

---

### Task 1: Config + `iniciar_job` enfileira no modo worker (TDD)

**Files:**
- Modify: `backend/app/core/config.py` (bloco "# App", ~linha 19)
- Modify: `backend/app/services/ingestao_automatica/runner.py` (final de `iniciar_job`, ~linhas 212-215)
- Test: `backend/tests/test_worker.py` (criar; Task 2 adiciona mais testes ao mesmo arquivo)

**Interfaces:**
- Consumes: nada novo.
- Produces: `settings.INGESTAO_EXECUTOR` (`"inline"` default | `"worker"`); `iniciar_job` retorna o job `pendente` SEM disparar thread quando `worker`. Task 2 depende só do comportamento (não de símbolos novos).

- [ ] **Step 0: Criar a branch**

```bash
cd c:\Users\lucas\Documents\projetos\dashboard_prefeituras
git checkout main && git checkout -b feat/worker-ingestao
```

- [ ] **Step 1: Escrever os testes que falham**

```python
# backend/tests/test_worker.py
"""Testes do modo worker: enfileirar (Task 1) e claim (Task 2).

Padrão do repo: sessão/queries via MagicMock — sem Postgres real
(SKIP LOCKED de verdade é coberto no E2E da verificação final)."""
from unittest.mock import MagicMock, patch

from app.services.ingestao_automatica.runner import iniciar_job


def _db_sem_job_ativo():
    """MagicMock de sessão: a query de Municipio resolve 1 município e a de
    IngestaoJob devolve zero ativos — iniciar_job passa pelas duas guardas
    (um chain único devolveria um 'job ativo' fantasma e estouraria 409)."""
    db = MagicMock()
    municipio_q = MagicMock()
    municipio_q.filter.return_value = municipio_q
    municipio_q.all.return_value = [MagicMock()]
    job_q = MagicMock()
    job_q.filter.return_value = job_q
    job_q.all.return_value = []
    db.query.side_effect = lambda model: municipio_q if model.__name__ == "Municipio" else job_q
    return db


def test_iniciar_job_worker_nao_dispara_thread():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread:
        st.INGESTAO_EXECUTOR = "worker"
        job = iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_not_called()
    db.commit.assert_called()
    assert job is not None


def test_iniciar_job_inline_dispara_thread():
    db = _db_sem_job_ativo()
    with patch("app.services.ingestao_automatica.runner.settings") as st, \
         patch("app.services.ingestao_automatica.runner.threading.Thread") as thread:
        st.INGESTAO_EXECUTOR = "inline"
        iniciar_job(db, "populacao", {"municipio_ids": [1]}, usuario_id=1)
    thread.assert_called_once()
    thread.return_value.start.assert_called_once()


def test_default_do_settings_e_inline():
    from app.core.config import settings
    assert settings.INGESTAO_EXECUTOR == "inline"
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
venv/Scripts/python -m pytest backend/tests/test_worker.py -q
```

Expected: FAIL — `settings` não é atributo do módulo runner / `INGESTAO_EXECUTOR` não existe.

- [ ] **Step 3: Implementar**

Em `backend/app/core/config.py`, no bloco `# App` (após `CORS_ORIGINS`):

```python
    # Ingestão: "inline" executa na thread da API (default); "worker" só
    # enfileira — o processo `python -m app.worker` reivindica e executa.
    INGESTAO_EXECUTOR: str = "inline"
```

Em `runner.py`, adicionar o import no topo (junto dos imports de `app.`):

```python
from app.core.config import settings
```

E no final de `iniciar_job`, trocar o bloco:

```python
    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job
```

por:

```python
    if settings.INGESTAO_EXECUTOR == "worker":
        # o processo worker reivindica o 'pendente' mais antigo e executa
        return job
    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job
```

- [ ] **Step 4: Rodar a suite backend inteira**

```bash
venv/Scripts/python -m pytest backend/tests -q
```

Expected: exit 0 (3 novos + suite anterior intacta — o default `inline` não muda nenhum teste existente).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/app/services/ingestao_automatica/runner.py backend/tests/test_worker.py
git commit -m "feat(ingestao): INGESTAO_EXECUTOR - modo worker enfileira sem disparar thread"
```

---

### Task 2: `app/worker.py` — claim + loop (TDD)

**Files:**
- Create: `backend/app/worker.py`
- Test: `backend/tests/test_worker.py` (acrescentar ao arquivo da Task 1)

**Interfaces:**
- Consumes: `_executar_job(job_id)` e `_agora()` do runner (existentes, sem mudança); `SessionLocal` de `app.db.session`.
- Produces: `reivindicar_job(db) -> int | None` e `main()` (entrypoint `python -m app.worker`).

- [ ] **Step 1: Acrescentar os testes que falham**

```python
# acrescentar ao final de backend/tests/test_worker.py
from app.worker import reivindicar_job


def test_reivindicar_job_marca_executando_e_commita():
    db = MagicMock()
    job = MagicMock()
    job.id = 42
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = job
    assert reivindicar_job(db) == 42
    assert job.status == "executando"
    assert job.iniciado_em is not None
    assert job.atualizado_em is not None
    db.commit.assert_called_once()
    db.rollback.assert_not_called()


def test_reivindicar_job_fila_vazia_faz_rollback_e_devolve_none():
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = None
    assert reivindicar_job(db) is None
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_reivindicar_job_usa_skip_locked():
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.return_value.first.return_value = None
    reivindicar_job(db)
    db.query.return_value.filter.return_value.order_by.return_value \
        .with_for_update.assert_called_once_with(skip_locked=True)
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
venv/Scripts/python -m pytest backend/tests/test_worker.py -q
```

Expected: FAIL — `app.worker` não existe.

- [ ] **Step 3: Criar `backend/app/worker.py`**

```python
"""Worker de ingestão: processo separado que executa os jobs da fila.

Com INGESTAO_EXECUTOR=worker a API apenas cria a linha 'pendente'; este
processo reivindica o job mais antigo com FOR UPDATE SKIP LOCKED (restart ou
réplica extra não duplica job) e roda o MESMO _executar_job do modo inline —
ticker de heartbeat, duas sessões e transições terminais guardadas, tudo
inalterado. Morte abrupta no meio de um job deixa 'executando' sem heartbeat
e o sweep lazy da API o marca 'abortado' em <=JOB_ORFAO_MINUTOS.

Uso (mesma imagem Docker do backend, start command próprio, sem alembic):
    python -m app.worker
"""
import logging
import time

logger = logging.getLogger("ingestao.worker")

POLL_SEGUNDOS = 3


def reivindicar_job(db):
    """Claim atômico: 'pendente' mais antigo -> 'executando' na mesma
    transação do SELECT ... FOR UPDATE SKIP LOCKED. Devolve o id ou None."""
    from app.models.ingestao_job import IngestaoJob
    from app.services.ingestao_automatica.runner import _agora

    job = (
        db.query(IngestaoJob)
        .filter(IngestaoJob.status == "pendente")
        .order_by(IngestaoJob.criado_em)
        .with_for_update(skip_locked=True)
        .first()
    )
    if job is None:
        db.rollback()  # encerra a transação aberta pelo SELECT
        return None
    job.status = "executando"
    job.iniciado_em = _agora()
    job.atualizado_em = _agora()
    db.commit()  # persiste o claim e libera o lock de linha
    return job.id


def main():
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    # popular o registry (cada import de fonte se auto-registra)
    import app.services.ingestao_automatica  # noqa: F401
    from app.db.session import SessionLocal
    from app.services.ingestao_automatica.runner import _executar_job

    logger.info("Worker de ingestão iniciado (poll a cada %ss)", POLL_SEGUNDOS)
    while True:
        job_id = None
        db = SessionLocal()
        try:
            job_id = reivindicar_job(db)
        except Exception:  # noqa: BLE001 — DB fora do ar não pode matar o loop
            logger.exception("Falha no poll — nova tentativa em %ss", POLL_SEGUNDOS)
        finally:
            db.close()
        if job_id is not None:
            logger.info("Job %s reivindicado — executando", job_id)
            _executar_job(job_id)
            logger.info("Job %s finalizado", job_id)
        else:
            time.sleep(POLL_SEGUNDOS)


if __name__ == "__main__":
    main()
```

(Nota de design: `_executar_job` re-seta `status="executando"`/`iniciado_em` ao começar — runner.py:259-263 — o que após o claim é um no-op inofensivo; por isso nenhuma mudança na função é necessária. Após terminar um job o loop NÃO dorme — vai direto ao próximo poll.)

- [ ] **Step 4: Rodar a suite backend inteira**

```bash
venv/Scripts/python -m pytest backend/tests -q
```

Expected: exit 0 (6 testes novos no arquivo + suite intacta).

- [ ] **Step 5: Smoke de import**

```bash
venv/Scripts/python -c "import app.worker; print('ok')"
```

Expected: `ok` (rodar da pasta `backend/` ou com PYTHONPATH=backend — igual aos smokes dos ciclos anteriores).

- [ ] **Step 6: Commit**

```bash
git add backend/app/worker.py backend/tests/test_worker.py
git commit -m "feat(ingestao): worker de fila (python -m app.worker) com claim SKIP LOCKED"
```

---

### Task 3: docker-compose + README

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md` (seção do fluxo de jobs em background; conferir WIP antes — ver Global Constraints)

**Interfaces:**
- Consumes: `python -m app.worker` (Task 2) e `INGESTAO_EXECUTOR` (Task 1).
- Produces: nada de código.

- [ ] **Step 1: docker-compose — serviço worker + env na api**

No serviço `api`, adicionar o bloco `environment` (mantendo o `env_file`):

```yaml
    environment:
      INGESTAO_EXECUTOR: worker
```

Adicionar o serviço novo após `api` (antes de `frontend`):

```yaml
  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: observatorio_worker
    restart: always
    command: python -m app.worker
    env_file:
      - .env
    depends_on:
      - db
    networks:
      - observatorio_net
```

(O `command` substitui o CMD do Dockerfile — o worker NÃO roda `alembic upgrade`; migração continua exclusiva da API.)

- [ ] **Step 2: README — documentar o modo worker**

Na seção que descreve o fluxo de jobs em background da ingestão automática, acrescentar uma subseção:

```markdown
### Worker de ingestão separado (opcional, recomendado para fontes pesadas)

Por padrão (`INGESTAO_EXECUTOR=inline`) os jobs rodam em uma thread do próprio
processo da API. Com `INGESTAO_EXECUTOR=worker` na API, o `POST` apenas cria o
job `pendente` e um processo separado (`python -m app.worker`) reivindica o job
mais antigo (`FOR UPDATE SKIP LOCKED`) e executa — mesma semântica de
heartbeat, trava global e órfãos. No docker-compose o serviço `worker` já sobe
nesse modo.

**Railway (passos manuais):**
1. Criar um serviço novo no mesmo repositório, root `backend/` (mesmo Dockerfile
   da API), com **Custom Start Command** `python -m app.worker`.
2. Copiar as variáveis de ambiente do serviço da API (banco etc.) para o worker.
3. Adicionar `INGESTAO_EXECUTOR=worker` **no serviço da API** e redeploy.

**Rollback:** remover `INGESTAO_EXECUTOR` da API (volta ao modo inline) e pausar
o serviço worker. Um job que ficar `pendente` por muito tempo indica worker
parado — conferir os logs do serviço (não existe abortar manual; o job espera).
Queda do worker no meio de um job: o job fica sem heartbeat e é marcado
`abortado` em até 10 minutos pelo sweep da API.
```

- [ ] **Step 3: Gates**

```bash
venv/Scripts/python -m pytest backend/tests -q
docker compose config -q
```

Expected: pytest exit 0; `docker compose config -q` exit 0 (compose válido; se o CLI não estiver disponível na máquina, validar YAML com `python -c "import yaml,io;yaml.safe_load(io.open('docker-compose.yml',encoding='utf-8'))"`).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git status --short README.md   # se APENAS a sua edição: incluir; se havia WIP antes, NÃO commitar o README
git add README.md              # (condicional ao check acima)
git commit -m "feat(infra): servico worker no compose + docs do modo worker (Railway)"
```

---

### Task 4: Verificação final + E2E local (API + worker em processos separados)

**Files:** nenhum (verificação; correções pontuais se algo falhar).

O E2E roda contra o banco de dev (o `backend/.env` local já aponta para ele — mesmo arranjo dos E2E dos ciclos de julho). Usa a fonte `populacao` com 1 município (execução de segundos).

- [ ] **Step 1: Gates completos**

```bash
venv/Scripts/python -m pytest backend/tests -q
```

Expected: exit 0.

- [ ] **Step 2: Subir API (modo worker) e worker em terminais separados**

```powershell
# terminal A (da pasta backend/):
$env:INGESTAO_EXECUTOR = "worker"; ..\venv\Scripts\python -m uvicorn app.main:app --port 8011
# terminal B (da pasta backend/):
..\venv\Scripts\python -m app.worker
```

- [ ] **Step 3: E2E de enfileiramento e execução**

Com um token ADMIN_GLOBAL (login via `POST /auth/login`):

1. **Fila espera worker**: derrubar o terminal B; `POST /ingestao-automatica/populacao/executar` com `{"municipio_ids": [<id de 1 município>]}` → 202 com `job_id`; `GET /jobs/{id}` continua `pendente` (≥10s); um segundo `POST` → **409** (job ativo).
2. **Worker executa**: subir o terminal B → em poucos segundos `GET /jobs/{id}` passa a `executando` e termina `concluido` com resumo.
3. **Sweep de órfão via API**: `UPDATE ingestao_job SET status='executando', atualizado_em = now() - interval '20 minutes' WHERE id = <job do passo 2>` (SQL direto); `GET /ingestao-automatica/fontes` → o sweep lazy marca o job `abortado`. Restaurar em seguida (`UPDATE ... SET status='concluido', erro=NULL, finalizado_em=now()`) para não sujar o histórico.
4. **Rollback inline**: derrubar A e B; subir a API SEM a env (`inline`); `POST` da mesma fonte → job vai a `executando`/`concluido` sem worker (thread, comportamento atual).

Expected: os 4 passos exatamente como descrito; anotar tempos no ledger.

- [ ] **Step 4: Reportar pendências**

Checklist do usuário: criar o serviço worker no Railway (passos do README) + setar `INGESTAO_EXECUTOR=worker` na API quando quiser ativar; até lá, prod segue inline sem mudança. Registrar no ledger e apontar que os Ciclos B (RAIS) e C (CNPJ) dependem do serviço criado.

---

## Self-review do plano (executado na escrita)

- **Spec coverage:** claim atômico + loop + logs + resiliência de DB → Task 2; `INGESTAO_EXECUTOR` + enfileirar sem thread → Task 1; invariantes (heartbeat/órfão/travas) preservados por construção (zero mudança em `_executar_job`, evidência runner.py:259-263) → nota da Task 2; compose + passos Railway + rollback → Task 3; E2E (fila espera worker, claim, sweep de órfão, rollback inline) → Task 4; casos de borda da spec (worker ocioso com API inline = inofensivo; dois claims = SKIP LOCKED; DB fora = retry) → cobertos por design/testes/E2E.
- **Placeholders:** nenhum.
- **Consistência:** `reivindicar_job`/`main` idênticos entre teste (Task 2 Step 1) e implementação (Step 3); `settings.INGESTAO_EXECUTOR` mesmo nome em config/runner/testes/compose/README; mock chain dos testes segue exatamente a query do claim (`query→filter→order_by→with_for_update→first`).
