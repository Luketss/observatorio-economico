import csv
import importlib
import tempfile
from pathlib import Path
from typing import List

from app.api.deps import get_current_user, get_db, require_role
from app.models.municipio import Municipio
from app.schemas.municipio import (
    DatasetDeletedResult,
    DatasetDescriptor,
    IngestaoDeletedResult,
    MunicipioCreate,
    MunicipioCreatedResult,
    MunicipioDatasetSummary,
    MunicipioDeletedResult,
    MunicipioOut,
    MunicipioSelecionavel,
    MunicipioUpdate,
    ReingestResult,
    SanidadeItem,
)
from app.services.municipio_management import (
    DATASET_LABELS,
    DATASET_REGISTRY,
    clone_municipio_data,
    count_dataset_rows_for_municipio,
    delete_all_datasets_for_municipio,
    delete_dataset_for_municipio,
    delete_municipio_cascade,
    record_ingestao_audit,
    run_sanity_checks,
)
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

# Dataset → (loader module, main CSV filename used for IBGE validation).
_LOADER_MAP = {
    "arrecadacao": ("ingestao.carregar_arrecadacao", "arrecadacao.csv"),
    "pib": ("ingestao.carregar_pib", "pib.csv"),
    "vaf": ("ingestao.carregar_vaf", "vaf.csv"),
    "caged": ("ingestao.carregar_caged", "caged.csv"),
    "rais": ("ingestao.carregar_rais", "rais_vinculos.csv"),
    "bolsa_familia": ("ingestao.carregar_bolsa_familia", "bolsa_familia.csv"),
    "pe_de_meia": ("ingestao.carregar_pe_de_meia", "pe_meia.csv"),
    "inss": ("ingestao.carregar_inss", "inss.csv"),
    "estban": ("ingestao.carregar_estban", "estban.csv"),
    "comex": ("ingestao.carregar_comex", "comex.csv"),
    "pix": ("ingestao.carregar_pix", "pix.csv"),
    "empresas": ("ingestao.carregar_cnpj", "estabelecimentos.csv"),
}


def _csv_ibge_mismatch(csv_path: Path, expected_ibge) -> str | None:
    """If the CSV has a codigo_ibge column whose values don't match the target
    município, return a human-readable mismatch detail; otherwise None (match,
    or no column to check against)."""
    if not expected_ibge:
        return None
    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=";")
            if "codigo_ibge" not in (reader.fieldnames or []):
                return None
            seen = set()
            for row in reader:
                v = (row.get("codigo_ibge") or "").strip()
                if v:
                    seen.add(v)
                if len(seen) > 5:
                    break
    except Exception:
        return None
    bad = sorted(v for v in seen if v != str(expected_ibge).strip())
    if bad:
        return f"codigo_ibge do CSV {bad} ≠ do município ({expected_ibge})"
    return None

router = APIRouter(prefix="/municipios", tags=["Municípios"])


# ==============================
# Listar municípios
# ==============================
@router.get("", response_model=List[MunicipioOut])
def listar_municipios(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    include_demo: bool = Query(True, description="Incluir municípios demo (padrão True; passe False para listas voltadas a comparativos)"),
):
    # ADMIN_GLOBAL vê todos
    if current_user.role.nome == "ADMIN_GLOBAL":
        query = db.query(Municipio)
        if not include_demo:
            query = query.filter(Municipio.is_demo.is_(False))
        municipios = query.all()
    else:
        municipios = (
            db.query(Municipio).filter(Municipio.id == current_user.municipio_id).all()
        )

    return municipios


# ==============================
# Listar municípios selecionáveis (para comparativo)
# ==============================
@router.get("/selecionaveis", response_model=List[MunicipioSelecionavel])
def listar_municipios_selecionaveis(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Municípios que podem ser fixados num comparativo. Aberta a qualquer
    autenticado de propósito: nome e UF são públicos (IBGE) e `/pib/ranking` já
    expõe todos sem checagem de papel. `/municipios` não serve aqui — devolve só
    o próprio município para não-admin."""
    return (
        db.query(Municipio)
        .filter(Municipio.ativo.is_(True), Municipio.is_demo.is_(False))
        .order_by(Municipio.estado, Municipio.nome)
        .all()
    )


# ==============================
# Criar município (opcionalmente clonando dados de outro)
# ==============================
@router.post("/", response_model=MunicipioCreatedResult)
def criar_municipio(
    data: MunicipioCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    # When the caller is cloning AND didn't explicitly set is_demo, default
    # to True — cloning is overwhelmingly used to create demo data. The
    # caller can still pass is_demo=False explicitly to opt out.
    is_demo_resolved = (
        data.is_demo
        if data.is_demo is not None
        else (data.clone_from_id is not None)
    )

    novo = Municipio(
        nome=data.nome,
        estado=data.estado,
        codigo_ibge=data.codigo_ibge,
        ativo=data.ativo,
        is_demo=is_demo_resolved,
    )

    db.add(novo)
    db.commit()
    db.refresh(novo)

    clone_summary = None
    if data.clone_from_id is not None:
        # If cloning fails the new município row stays; admin can delete it.
        clone_summary = clone_municipio_data(
            db, source_id=data.clone_from_id, target_id=novo.id
        )

    return MunicipioCreatedResult(municipio=novo, clone_summary=clone_summary)


# ==============================
# Atualizar município
# ==============================
@router.put("/{municipio_id}", response_model=MunicipioOut)
def atualizar_municipio(
    municipio_id: int,
    data: MunicipioUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    municipio = db.get(Municipio, municipio_id)

    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(municipio, field, value)

    db.commit()
    db.refresh(municipio)

    return municipio


# ==============================
# Excluir município (cascade — wipes 55 dependent tables)
# ==============================
@router.delete("/{municipio_id}", response_model=MunicipioDeletedResult)
def excluir_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    summary = delete_municipio_cascade(db, municipio_id)
    return MunicipioDeletedResult(deleted=municipio_id, summary=summary)


# ==============================
# Datasets — catalog + per-município row counts + per-dataset wipe
# ==============================
@router.get("/datasets", response_model=List[DatasetDescriptor])
def listar_datasets(current_user=Depends(get_current_user)):
    """Catalog of all datasets the admin can target. Open to any logged-in
    user (cheap metadata)."""
    return [
        DatasetDescriptor(key=key, label=DATASET_LABELS.get(key, key))
        for key in DATASET_REGISTRY.keys()
    ]


@router.get(
    "/{municipio_id}/datasets-summary",
    response_model=MunicipioDatasetSummary,
)
def resumir_datasets_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    counts = count_dataset_rows_for_municipio(db, municipio_id)
    return MunicipioDatasetSummary(municipio_id=municipio_id, counts=counts)


@router.delete("/{municipio_id}/datasets", response_model=IngestaoDeletedResult)
def excluir_ingestao_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    """Apaga TODA a ingestão (todos os datasets) do município, preservando
    dados operacionais e a própria linha do município."""
    summary = delete_all_datasets_for_municipio(db, municipio_id)
    record_ingestao_audit(
        db, municipio_id=municipio_id, usuario_id=current_user.id, dataset=None,
        acao="delete_ingestao", num_linhas=sum(summary.values()), status="ok",
        detalhe=f"{len(summary)} tabela(s)",
    )
    return IngestaoDeletedResult(municipio_id=municipio_id, summary=summary)


@router.delete(
    "/{municipio_id}/datasets/{dataset_key}",
    response_model=DatasetDeletedResult,
)
def excluir_dataset_municipio(
    municipio_id: int,
    dataset_key: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    summary = delete_dataset_for_municipio(db, municipio_id, dataset_key)
    record_ingestao_audit(
        db, municipio_id=municipio_id, usuario_id=current_user.id, dataset=dataset_key,
        acao="delete_dataset", num_linhas=sum(summary.values()), status="ok",
    )
    return DatasetDeletedResult(
        municipio_id=municipio_id,
        dataset_key=dataset_key,
        summary=summary,
    )


@router.get("/{municipio_id}/sanidade", response_model=List[SanidadeItem])
def sanidade_municipio(
    municipio_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    """Data-sanity findings for a município (MEI/Simples zerados, IPM nulo,
    séries de 1 ano só, etc.) — surfaced to ADMIN_GLOBAL."""
    return [SanidadeItem(**c) for c in run_sanity_checks(db, municipio_id)]


@router.post(
    "/{municipio_id}/datasets/{dataset_key}/reingest",
    response_model=ReingestResult,
)
def reingerir_dataset(
    municipio_id: int,
    dataset_key: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    """Re-ingest a dataset from uploaded CSV(s): validate codigo_ibge against the
    target município, wipe the dataset's rows, run the loader and audit it.
    Prevents the 'data loaded into the wrong city' class of error."""
    if dataset_key not in DATASET_REGISTRY or dataset_key not in _LOADER_MAP:
        raise HTTPException(status_code=400, detail=f"Dataset desconhecido: '{dataset_key}'.")
    municipio = db.get(Municipio, municipio_id)
    if not municipio:
        raise HTTPException(status_code=404, detail="Município não encontrado.")

    module_path, main_filename = _LOADER_MAP[dataset_key]

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        for uf in files:
            name = Path(uf.filename or "").name
            if not name:
                continue
            with open(tmpdir / name, "wb") as out:
                out.write(uf.file.read())

        main_csv = tmpdir / main_filename
        if not main_csv.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Arquivo principal '{main_filename}' não encontrado no upload.",
            )

        mismatch = _csv_ibge_mismatch(main_csv, municipio.codigo_ibge)
        if mismatch:
            record_ingestao_audit(
                db, municipio_id=municipio_id, usuario_id=current_user.id, dataset=dataset_key,
                acao="reingest", num_linhas=0, status="erro", detalhe=mismatch,
            )
            raise HTTPException(status_code=400, detail=f"Validação de IBGE falhou: {mismatch}. Carga abortada.")

        # Wipe then load (loaders use on_conflict_do_nothing, so a wipe is needed
        # for corrections to take effect).
        removidas = sum(delete_dataset_for_municipio(db, municipio_id, dataset_key).values())
        try:
            loader = importlib.import_module(module_path)
            loader.carregar(tmpdir, municipio.nome, municipio.estado, db)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            db.rollback()
            record_ingestao_audit(
                db, municipio_id=municipio_id, usuario_id=current_user.id, dataset=dataset_key,
                acao="reingest", num_linhas=0, status="erro", detalhe=str(e)[:300],
            )
            raise HTTPException(status_code=500, detail=f"Falha ao reingerir: {str(e)[:200]}")

        inseridas = count_dataset_rows_for_municipio(db, municipio_id).get(dataset_key, 0)

    record_ingestao_audit(
        db, municipio_id=municipio_id, usuario_id=current_user.id, dataset=dataset_key,
        acao="reingest", num_linhas=inseridas, status="ok", detalhe=f"removidas={removidas}",
    )
    return ReingestResult(
        municipio_id=municipio_id,
        dataset_key=dataset_key,
        linhas_removidas=removidas,
        linhas_inseridas=inseridas,
    )
