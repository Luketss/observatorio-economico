import csv
from datetime import datetime
from pathlib import Path
from tqdm import tqdm
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


def _read_csv_keyed(path: Path) -> dict[str, dict]:
    """Read a CSV keyed by cnpj_basico, keeping first row on duplicates."""
    result: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            key = row.get("cnpj_basico", "").strip()
            if key and key not in result:
                result[key] = row
    return result


def carregar(cidade_dir: Path, city_name: str, estado: str, db: Session) -> None:
    estab_path = cidade_dir / "estabelecimentos.csv"
    if not estab_path.exists():
        print(f"  ⚠️  estabelecimentos.csv não encontrado em {cidade_dir} — pulando CNPJ.")
        return

    municipio = obter_ou_criar_municipio(db, city_name, estado)

    # Load existing CNPJs for this municipality to avoid duplicates
    existentes: set[str] = {
        r[0] for r in db.query(Empresa.cnpj_basico).filter(Empresa.municipio_id == municipio.id).all()
    }

    # Read lookup tables from the other two files
    empresas = _read_csv_keyed(cidade_dir / "empresas.csv") if (cidade_dir / "empresas.csv").exists() else {}
    simples = _read_csv_keyed(cidade_dir / "simples.csv") if (cidade_dir / "simples.csv").exists() else {}

    pendente = 0
    with open(estab_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in tqdm(reader, desc="    Empresas", unit="reg", leave=False):
            cnpj_basico = row.get("cnpj_basico", "").strip()
            if not cnpj_basico or cnpj_basico in existentes:
                continue

            existentes.add(cnpj_basico)
            emp = empresas.get(cnpj_basico, {})
            simp = simples.get(cnpj_basico, {})

            db.add(Empresa(
                municipio_id=municipio.id,
                cnpj_basico=cnpj_basico,
                razao_social=emp.get("razao_social", "").strip() or None,
                nome_fantasia=row.get("nome_fantasia", "").strip() or None,
                situacao=row.get("situacao", "").strip() or None,
                data_inicio=_parse_data(row.get("data_inicio", "")),
                cnae_fiscal=row.get("cnae_fiscal", "").strip() or None,
                porte=emp.get("porte", "").strip() or None,
                capital_social=_parse_capital(emp.get("capital_social", "")),
                opcao_simples=_parse_bool(simp.get("opcao_simples", "")),
                opcao_mei=_parse_bool(simp.get("opcao_mei", "")),
            ))
            pendente += 1

            if pendente >= BATCH_SIZE:
                db.commit()
                pendente = 0

    if pendente:
        db.commit()
