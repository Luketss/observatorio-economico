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
from sqlalchemy import text

from app.core.config import settings
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


def _transicao_abortado_condicional(db, job) -> bool:
    """UPDATE condicional (id + status + atualizado_em vistos por `job`) que
    marca 'abortado'. Read-then-write vira corrida quando outro executor
    reivindica ou atualiza o heartbeat do mesmo job entre a leitura que
    decidiu 'é órfão' e esta escrita — o UPDATE só casa a linha se nada mudou
    nesse intervalo. Não comita nem dá refresh: cabe ao chamador, que conhece
    o boundary da própria transação. Devolve True se abortou; False se
    rowcount==0 (o job avançou nesse meio-tempo e não deve ser tratado como
    órfão)."""
    from app.models.ingestao_job import IngestaoJob

    filtro_heartbeat = (
        IngestaoJob.atualizado_em.is_(None)
        if job.atualizado_em is None
        else IngestaoJob.atualizado_em == job.atualizado_em
    )
    linhas = (
        db.query(IngestaoJob)
        .filter(IngestaoJob.id == job.id, IngestaoJob.status == job.status, filtro_heartbeat)
        .update(
            {
                "status": "abortado",
                "erro": "Sem heartbeat — processo reiniciado durante a execução.",
                "finalizado_em": _agora(),
            },
            synchronize_session=False,
        )
    )
    return linhas == 1


def _modo_worker() -> bool:
    """Normaliza INGESTAO_EXECUTOR (espaços/caixa) antes de decidir o modo.
    Valor não reconhecido loga um aviso e cai para inline — o default seguro
    — em vez de travar a criação de jobs por causa de um env var mal
    formatado."""
    valor = (settings.INGESTAO_EXECUTOR or "").strip().lower()
    if valor not in ("inline", "worker"):
        logger.warning(
            "INGESTAO_EXECUTOR=%r não reconhecido (esperado 'inline' ou 'worker') — tratando como 'inline'",
            settings.INGESTAO_EXECUTOR,
        )
        return False
    return valor == "worker"


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
    """municipio_ids tem precedência sobre estado — seleção explícita nunca é
    reduzida silenciosamente pela UF."""
    from app.models.municipio import Municipio

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    municipio_ids = (filtros or {}).get("municipio_ids")
    estado = (filtros or {}).get("estado")
    if municipio_ids:
        query = query.filter(Municipio.id.in_(municipio_ids))
    elif estado:
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


def iniciar_job(db, dataset_key: str, filtros: dict, usuario_id: int):
    from app.models.ingestao_job import IngestaoJob

    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None and dataset_key != DATASET_TODAS:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    municipios = resolver_municipios(db, filtros)
    if not municipios:
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")
    if fonte is not None and fonte.max_municipios is not None and len(municipios) > fonte.max_municipios:
        # A fonte declara o teto (cnpj mantém em memória todos os
        # estabelecimentos dos alvos). Recusar aqui, antes de criar o job, é o
        # que o admin vê na hora — antes o job nascia, "concluía" em 1s com 0
        # linhas e o motivo ficava escondido no resumo.
        teto = fonte.max_municipios
        if (filtros or {}).get("municipio_ids"):
            dica = f"reduza a seleção para até {teto} municípios"
        else:
            dica = (f"selecione até {teto} municípios na lista (sem filtro, ou por UF com "
                    "mais municípios que isso, a execução é recusada)")
        raise HTTPException(
            status_code=400,
            detail=(
                f"{fonte.label}: a seleção tem {len(municipios)} municípios e a fonte aceita "
                f"no máximo {teto} por execução — {dica}."
            ),
        )

    # serializa criação de jobs entre workers/requests (lock liberado no commit/rollback)
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ingestao_job_iniciar'))"))
    ativos = db.query(IngestaoJob).filter(IngestaoJob.status.in_(STATUS_ATIVOS)).all()
    for ativo in ativos:
        # rowcount==0 (outro executor reivindicou/atualizou o heartbeat entre
        # a leitura acima e este UPDATE) faz o job seguir tratado como ativo,
        # exatamente como se job_orfao tivesse dado False.
        if job_orfao(ativo) and _transicao_abortado_condicional(db, ativo):
            continue
        raise HTTPException(
            status_code=409,
            detail=f"Já existe uma execução em andamento ({ativo.dataset}, job {ativo.id}). Aguarde terminar.",
        )

    job = IngestaoJob(dataset=dataset_key, status="pendente", filtros=filtros, usuario_id=usuario_id)
    db.add(job)
    db.commit()   # único commit: persiste aborto de órfãos + job novo e libera o lock
    db.refresh(job)

    if _modo_worker():
        # o processo worker reivindica o 'pendente' mais antigo e executa
        return job
    threading.Thread(
        target=_executar_job, args=(job.id,), daemon=True, name=f"ingestao-job-{job.id}"
    ).start()
    return job


def _ticker_heartbeat(job_id: int, parar_ticker: threading.Event) -> None:
    """Thread secundária: mantém atualizado_em vivo durante trechos longos sem
    callback de progresso (ex.: download >10min de um ZIP grande) — sem isso o
    job LIVE pareceria órfão e uma segunda requisição o abortaria, criando uma
    execução duplicada. Sessão própria (nunca compartilha db_job com a thread
    principal — sessões do SQLAlchemy não são thread-safe)."""
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob

    while not parar_ticker.wait(60):
        db_t = SessionLocal()
        try:
            db_t.query(IngestaoJob).filter(IngestaoJob.id == job_id).update(
                {"atualizado_em": _agora()}, synchronize_session=False
            )
            db_t.commit()
        except Exception:  # noqa: BLE001 — uma falha de tick não pode matar o loop
            logger.exception("Falha ao atualizar heartbeat (ticker) do job %s", job_id)
        finally:
            db_t.close()


def _executar_job(job_id: int, ja_reivindicado: bool = False) -> None:
    """`ja_reivindicado=False` (modo inline/thread): a própria função faz a
    transição 'pendente'->'executando' via UPDATE guardado — se um worker já
    reivindicou o mesmo job entre a criação e esta chamada, o UPDATE não casa
    nenhuma linha e a função desiste sem tocar a fonte (o outro executor já
    está rodando). `ja_reivindicado=True` (modo worker): o claim
    (`reivindicar_job`) já fez essa transição atomicamente via
    SELECT FOR UPDATE SKIP LOCKED; aqui só resta gravar o progresso_total
    (calculado depois do claim, quando os municípios já foram resolvidos)."""
    from app.db.session import SessionLocal
    from app.models.ingestao_job import IngestaoJob
    from app.services.municipio_management import record_ingestao_audit

    db = SessionLocal()       # sessão da fonte (commits por município)
    db_job = SessionLocal()   # sessão exclusiva da linha do job (heartbeat)
    job = None
    parar_ticker = threading.Event()
    ticker = None
    try:
        job = db_job.get(IngestaoJob, job_id)
        if job is None:
            logger.error("Job %s não encontrado ao iniciar a thread", job_id)
            return
        fonte = FONTES_AUTOMATICAS.get(job.dataset)  # None quando dataset == DATASET_TODAS
        if fonte is None and job.dataset != DATASET_TODAS:
            job.status = "erro"
            job.erro = (f"fonte '{job.dataset}' não registrada neste executor — "
                        "worker desatualizado? Reexecute após o deploy.")
            job.finalizado_em = _agora()
            job.atualizado_em = _agora()
            db_job.commit()
            return
        filtros = job.filtros or {}
        municipios = resolver_municipios(db, filtros)

        if ja_reivindicado:
            db_job.query(IngestaoJob).filter(IngestaoJob.id == job_id).update(
                {"progresso_total": len(municipios), "atualizado_em": _agora()},
                synchronize_session=False,
            )
            db_job.commit()
            db_job.refresh(job)
        else:
            linhas = (
                db_job.query(IngestaoJob)
                .filter(IngestaoJob.id == job_id, IngestaoJob.status == "pendente")
                .update(
                    {
                        "status": "executando",
                        "iniciado_em": _agora(),
                        "atualizado_em": _agora(),
                        "progresso_total": len(municipios),
                    },
                    synchronize_session=False,
                )
            )
            db_job.commit()
            if linhas == 0:
                logger.warning(
                    "Job %s não estava mais 'pendente' — outro executor assumiu; desistindo desta execução",
                    job_id,
                )
                return
            db_job.refresh(job)

        ticker = threading.Thread(
            target=_ticker_heartbeat, args=(job_id, parar_ticker), daemon=True,
            name=f"ingestao-job-{job_id}-ticker",
        )
        ticker.start()

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

        if job.dataset == DATASET_TODAS:
            itens = _executar_sequencia_todas(db, filtros, job.usuario_id, progresso)
            resumo_json = {"fontes": itens}
            status_final = status_final_todas(itens)
            erro_final = mensagem_erro_todas(itens) if status_final == "erro" else None
        else:
            extras = {"arquivo_id": filtros.get("arquivo_id")} if fonte.requer_arquivo else {}
            resumo = fonte.executar(
                db=db, municipios=municipios, anos=filtros.get("anos"),
                usuario_id=job.usuario_id, notificar=filtros.get("notificar", True),
                progresso=progresso, **extras,
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
    except Exception as exc:  # noqa: BLE001 — thread não pode morrer sem registrar
        logger.exception("Job %s falhou", job_id)
        if job is not None:
            try:
                db.rollback()
                record_ingestao_audit(
                    db, municipio_id=None, usuario_id=job.usuario_id, dataset=job.dataset,
                    acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
                )
                db_job.refresh(job)
                if job.status == "executando":
                    job.status = "erro"
                    job.erro = str(exc)[:1000]
                    job.finalizado_em = _agora()
                    job.atualizado_em = _agora()
                    db_job.commit()
                else:
                    logger.warning(
                        "Job %s foi marcado %s externamente; resultado descartado do status",
                        job_id, job.status,
                    )
            except Exception:
                logger.exception("Falha ao registrar erro do job %s", job_id)
    finally:
        parar_ticker.set()
        if ticker is not None:
            ticker.join(timeout=5)
        db.close()
        db_job.close()
