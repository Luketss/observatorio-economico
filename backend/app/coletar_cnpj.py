"""Coleta CNPJ/RFB a partir de uma maquina no Brasil.

O servidor de arquivos da RFB recusa conexoes vindas da Railway, entao a fonte
automatica `cnpj` nao roda no worker. Este comando executa a MESMA fonte na
maquina local, gravando direto no banco apontado pelas variaveis POSTGRES_*
(ver docs/coleta-cnpj.md). O job aparece no "Historico de coletas" do admin.

Uso (a partir de backend/):
    python -m app.coletar_cnpj --listar Divin
    python -m app.coletar_cnpj --email admin@uaizi.com.br --municipio-id 12 [--municipio-id 34 ...]
"""
import argparse
import logging
import sys

# popular o registry de fontes (cada import de fonte se auto-registra), como o worker
import app.services.ingestao_automatica  # noqa: F401
from fastapi import HTTPException
from sqlalchemy import func

from app.db.session import SessionLocal
from app.services.ingestao_automatica.runner import _executar_job, criar_job

logger = logging.getLogger("ingestao.coletar_cnpj")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.coletar_cnpj",
        description="Executa a coleta CNPJ/RFB localmente (maquina no Brasil).")
    p.add_argument("--email", help="e-mail de um ADMIN_GLOBAL ativo (dono do job)")
    p.add_argument("--municipio-id", dest="municipio_ids", type=int, action="append",
                   default=[], help="id do municipio (repetivel)")
    p.add_argument("--listar", metavar="TEXTO",
                   help="lista id/nome/UF dos municipios ativos que contem o texto e sai")
    return p


def _listar(texto: str) -> int:
    from app.models.municipio import Municipio

    db = SessionLocal()
    try:
        achados = (db.query(Municipio)
                   .filter(Municipio.ativo.is_(True), Municipio.nome.ilike(f"%{texto}%"))
                   .order_by(Municipio.nome).all())
        for m in achados:
            print(f"{m.id}\t{m.nome}\t{m.estado}")
        if not achados:
            print("Nenhum municipio ativo encontrado.", file=sys.stderr)
    finally:
        db.close()
    return 0


def _resumir(job) -> int:
    resumo = job.resumo or {}
    print(f"Status final: {job.status}")
    if resumo:
        print(f"Municipios ok: {resumo.get('municipios_ok', 0)} | "
              f"erro: {resumo.get('municipios_erro', 0)} | linhas: {resumo.get('linhas', 0)}")
    erros = list(resumo.get("erros") or [])
    if job.erro:
        erros.insert(0, job.erro)
    for e in erros:
        print(f"ERRO: {e}")
    # 'concluido' com todos os municipios falhando (ex.: fonte indisponivel) e falha
    sem_nenhum_ok = bool(resumo) and not resumo.get("municipios_ok") and bool(resumo.get("erros"))
    return 0 if job.status == "concluido" and not sem_nenhum_ok else 1


def main(argv=None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = _parser()
    args = p.parse_args(argv)

    if args.listar is not None:
        return _listar(args.listar)

    if not args.email:
        p.error("--email e obrigatorio (ou use --listar TEXTO)")
    if not args.municipio_ids:
        p.error("informe ao menos um --municipio-id (use --listar para achar o id)")

    from app.models.usuario import Usuario

    db = SessionLocal()
    try:
        email = args.email.strip().lower()
        usuario = db.query(Usuario).filter(func.lower(Usuario.email) == email).first()
        if (usuario is None or not usuario.ativo
                or usuario.role is None or usuario.role.nome != "ADMIN_GLOBAL"):
            print(f"Usuario '{args.email}' nao existe, esta inativo ou nao e ADMIN_GLOBAL.",
                  file=sys.stderr)
            sys.exit(2)
        filtros = {"municipio_ids": list(args.municipio_ids), "notificar": False}
        try:
            job = criar_job(db, "cnpj", filtros, usuario.id, reivindicado=True)
        except HTTPException as exc:
            print(f"Nao foi possivel iniciar a coleta: {exc.detail}", file=sys.stderr)
            sys.exit(1)
        job_id = job.id
    finally:
        db.close()

    logger.info("Job %s criado (executando) - coletando na propria maquina", job_id)
    _executar_job(job_id, ja_reivindicado=True)

    from app.models.ingestao_job import IngestaoJob

    db = SessionLocal()
    try:
        job = db.get(IngestaoJob, job_id)
        return _resumir(job)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
