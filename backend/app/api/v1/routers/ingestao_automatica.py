from dataclasses import asdict
from datetime import datetime

import requests
from app.api.deps import get_db, require_role
from app.models.dataset_info import DatasetInfo
from app.models.ingestao_audit import IngestaoAudit
from app.models.municipio import Municipio
from app.services.ingestao_automatica import FONTES_AUTOMATICAS
from app.services.municipio_management import record_ingestao_audit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ingestao-automatica", tags=["Ingestão Automática"])


class ExecutarIn(BaseModel):
    estado: str | None = None
    municipio_id: int | None = None
    anos: list[int] | None = None
    notificar: bool = True


@router.get("/fontes")
def listar_fontes(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    out = []
    for key, fonte in FONTES_AUTOMATICAS.items():
        ultimo = (
            db.query(IngestaoAudit)
            .filter(IngestaoAudit.acao == "auto_ingest", IngestaoAudit.dataset == key)
            .order_by(IngestaoAudit.criado_em.desc())
            .first()
        )
        out.append({
            "key": key,
            "label": fonte.label,
            "fonte": fonte.fonte,
            "ultima_execucao": None if ultimo is None else {
                "criado_em": ultimo.criado_em,
                "status": ultimo.status,
                "num_linhas": ultimo.num_linhas,
                "detalhe": ultimo.detalhe,
            },
        })
    return out


def _atualizar_dataset_info(db: Session, key: str, fonte_label: str, fonte_texto: str) -> None:
    info = db.query(DatasetInfo).filter(DatasetInfo.dataset == key).first()
    if info is None:
        info = DatasetInfo(dataset=key, titulo=fonte_label, conteudo="")
        db.add(info)
    if not info.fonte:
        info.fonte = fonte_texto
    info.data_atualizacao = datetime.now().strftime("%d/%m/%Y")
    db.commit()


@router.post("/{dataset_key}/executar")
def executar_fonte(
    dataset_key: str,
    body: ExecutarIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    fonte = FONTES_AUTOMATICAS.get(dataset_key)
    if fonte is None:
        raise HTTPException(status_code=404, detail=f"Fonte automática '{dataset_key}' não existe.")

    query = db.query(Municipio).filter(Municipio.ativo.is_(True))
    if body.municipio_id is not None:
        query = query.filter(Municipio.id == body.municipio_id)
    if body.estado:
        query = query.filter(Municipio.estado == body.estado.upper())
    municipios = query.all()
    if not municipios:
        raise HTTPException(status_code=404, detail="Nenhum município ativo para o filtro informado.")

    try:
        resumo = fonte.executar(
            db=db, municipios=municipios, anos=body.anos,
            usuario_id=current_user.id, notificar=body.notificar,
        )
    except (requests.RequestException, ValueError) as exc:
        record_ingestao_audit(
            db, municipio_id=None, usuario_id=current_user.id, dataset=dataset_key,
            acao="auto_ingest", num_linhas=0, status="erro", detalhe=str(exc)[:1000],
        )
        raise HTTPException(status_code=502, detail=f"Falha ao acessar a fonte externa: {exc}")

    record_ingestao_audit(
        db,
        municipio_id=municipios[0].id if len(municipios) == 1 else None,
        usuario_id=current_user.id,
        dataset=dataset_key,
        acao="auto_ingest",
        num_linhas=resumo.linhas,
        status="ok" if not resumo.erros else "aviso",
        detalhe="; ".join(resumo.erros[:20]) or None,
    )
    _atualizar_dataset_info(db, dataset_key, fonte.label, fonte.fonte)
    return asdict(resumo)
