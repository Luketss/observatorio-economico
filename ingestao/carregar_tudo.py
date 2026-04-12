"""
Master ingestion script — runs all dataset loaders in order.

Usage (from project root):
    python -m ingestao.carregar_tudo

To load only specific cities, edit the CIDADES list below.
Leave it empty to load all available cities.
"""

import os

from tqdm import tqdm

import ingestao.carregar_arrecadacao as arrecadacao
import ingestao.carregar_bolsa_familia as bolsa_familia
import ingestao.carregar_caged as caged
import ingestao.carregar_cnpj as cnpj
import ingestao.carregar_comex as comex
import ingestao.carregar_estban as estban
import ingestao.carregar_inss as inss
import ingestao.carregar_pe_de_meia as pe_de_meia
import ingestao.carregar_pib as pib
import ingestao.carregar_rais as rais

# ─────────────────────────────────────────────────────────────────────────────
# FILTER: list the cities you want to load.
# Names are matched case-insensitively against the CSV filenames.
# Leave empty to load ALL available cities.
#
# Examples:
#   CIDADES = ["Oliveira", "Divinopolis"]
#   CIDADES = ["Nova Serrana", "Claudio", "Para de Minas"]
#   CIDADES = []   # loads everything
# ─────────────────────────────────────────────────────────────────────────────
# CIDADES = ["Nova Lima", "Oliveira", "Claudio", "Nova Serrana"]
CIDADES = ["Cabo Verde"]


LOADERS = [
    ("Arrecadação", arrecadacao),
    ("PIB", pib),
    ("CAGED", caged),
    ("RAIS", rais),
    ("Bolsa Família", bolsa_familia),
    ("Pé-de-Meia", pe_de_meia),
    ("INSS", inss),
    ("Estban", estban),
    ("Comex", comex),
    ("CNPJ", cnpj),
]


def _matches_city(filename: str, cidades: list[str]) -> bool:
    """Return True if the filename contains any of the requested city names."""
    if not cidades:
        return True
    normalized = filename.upper().replace("_", " ").replace("-", " ")
    return any(c.upper().replace("_", " ") in normalized for c in cidades)


def run_loader(nome: str, module, db, cidades: list[str]):
    base_path = module.BASE_PATH
    if not os.path.isdir(base_path):
        tqdm.write(f"  ⚠️  Pasta não encontrada: {base_path} — pulando.")
        return

    arquivos = sorted(f for f in os.listdir(base_path) if f.endswith(".csv"))
    selecionados = [f for f in arquivos if _matches_city(f, cidades)]

    if not selecionados:
        tqdm.write(f"  ⚠️  Nenhum arquivo corresponde ao filtro de cidades.")
        return

    for arquivo in tqdm(selecionados, desc=f"  {nome}", unit="arquivo", leave=False):
        caminho = os.path.join(base_path, arquivo)
        module.carregar_csv(db, caminho)


def main():
    print("=" * 60)
    print("Iniciando carga de dados")
    if CIDADES:
        print(f"Cidades selecionadas: {', '.join(CIDADES)}")
    else:
        print("Cidades: todas")
    print("=" * 60)

    from app.db.session import SessionLocal  # noqa: PLC0415

    erros = []
    ativos = [entry for entry in LOADERS]

    with tqdm(ativos, desc="Datasets", unit="dataset") as pbar:
        for nome, module in pbar:
            pbar.set_postfix_str(nome)
            db = SessionLocal()
            try:
                run_loader(nome, module, db, CIDADES)
            except Exception as e:
                db.rollback()
                tqdm.write(f"  ❌ {nome}: {e}")
                erros.append((nome, e))
            finally:
                db.close()

    print("\n" + "=" * 60)
    if erros:
        print(f"⚠️  Carga finalizada com {len(erros)} erro(s):")
        for nome, e in erros:
            print(f"   - {nome}: {e}")
    else:
        print("✅ Carga finalizada com sucesso.")
    print("=" * 60)


if __name__ == "__main__":
    main()
    main()
