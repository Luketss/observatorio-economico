import csv
from datetime import datetime
from pathlib import Path
from tqdm import tqdm

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.empresa import Empresa
from ingestao.utils import obter_ou_criar_municipio

BATCH_SIZE = 500


def _parse_data(valor: str) -> "datetime.date | None":
    valor = valor.strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y%m%d").date()
    except ValueError:
        return None


def _parse_capital(valor: str) -> "float | None":
    valor = valor.strip()
    if not valor:
        return None
    try:
        return float(valor.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _parse_bool(valor: str) -> bool:
    return valor.strip().upper() in ("S", "SIM", "1", "TRUE")


def _parse_mei(valor: str) -> bool:
    """MEI flag. The Receita Federal "Simples" extract used here stores the MEI
    opt-in DATE (AAAAMMDD) in the opcao_mei column, not an S/N flag — a real
    date (e.g. "20090701") means the company is MEI, while "00000000"/empty
    means it is not. A plain S/N flag is still accepted for robustness."""
    v = valor.strip().upper()
    if v in ("S", "SIM", "TRUE"):
        return True
    if v in ("", "N", "NAO", "NÃO", "0", "00000000"):
        return False
    return v.isdigit() and len(v) == 8  # AAAAMMDD opt-in date


def _read_csv_keyed(path: Path) -> dict[str, dict]:
    """Read a CSV keyed by cnpj_basico, keeping first row on duplicates."""
    result: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            key = row.get("cnpj_basico", "").strip()
            if key and key not in result:
                result[key] = row
    return result


def _flush(db: Session, batch: list[dict]) -> None:
    if not batch:
        return
    stmt = pg_insert(Empresa).values(batch)
    stmt = stmt.on_conflict_do_nothing(
        index_elements=["municipio_id", "cnpj_basico"],
    )
    db.execute(stmt)
    db.commit()


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    estab_path = cidade_dir / "estabelecimentos.csv"
    if not estab_path.exists():
        print(f"  [AVISO]  estabelecimentos.csv não encontrado em {cidade_dir} — pulando CNPJ.")
        return

    municipio = obter_ou_criar_municipio(db, city_name, estado)

    empresas = _read_csv_keyed(cidade_dir / "empresas.csv") if (cidade_dir / "empresas.csv").exists() else {}
    simples = _read_csv_keyed(cidade_dir / "simples.csv") if (cidade_dir / "simples.csv").exists() else {}

    # Dedup CNPJs within this CSV so each batch doesn't conflict with itself.
    seen_in_csv: set[str] = set()
    batch: list[dict] = []

    with open(estab_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in tqdm(reader, desc="    Empresas", unit="reg", leave=False):
            cnpj_basico = row.get("cnpj_basico", "").strip()
            if not cnpj_basico or cnpj_basico in seen_in_csv:
                continue
            seen_in_csv.add(cnpj_basico)

            emp = empresas.get(cnpj_basico, {})
            simp = simples.get(cnpj_basico, {})

            batch.append({
                "municipio_id": municipio.id,
                "cnpj_basico": cnpj_basico,
                "razao_social": emp.get("razao_social", "").strip() or None,
                "nome_fantasia": row.get("nome_fantasia", "").strip() or None,
                "situacao": row.get("situacao", "").strip() or None,
                "data_inicio": _parse_data(row.get("data_inicio", "")),
                "cnae_fiscal": row.get("cnae_fiscal", "").strip() or None,
                "porte": emp.get("porte", "").strip() or None,
                "capital_social": _parse_capital(emp.get("capital_social", "")),
                "opcao_simples": _parse_bool(simp.get("opcao_simples", "")),
                "opcao_mei": _parse_mei(simp.get("opcao_mei", "")),
            })

            if len(batch) >= BATCH_SIZE:
                _flush(db, batch)
                batch = []

    _flush(db, batch)
