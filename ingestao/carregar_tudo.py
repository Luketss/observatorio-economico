"""
Master ingestion script — runs all dataset loaders in order.

Usage (from project root):
    python -m ingestao.carregar_tudo --estado MG --cidades cabo_verde
    python -m ingestao.carregar_tudo --estado MG --cidades cabo_verde nova_lima
    python -m ingestao.carregar_tudo --estado SP --cidades city_sp
"""
import argparse
from pathlib import Path

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
import ingestao.carregar_pix as pix
import ingestao.carregar_rais as rais


def normalizar_city_name(folder: str) -> str:
    """Convert folder name to display name: 'cabo_verde' -> 'Cabo Verde'."""
    return folder.replace("_", " ").title()


def build_loader_list() -> list[tuple[str, object]]:
    return [
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
        ("PIX", pix),
    ]


def main():
    parser = argparse.ArgumentParser(description="Carga de dados do Observatório Econômico")
    parser.add_argument("--estado", required=True, help="UF do estado (ex: MG, SP)")
    parser.add_argument("--cidades", nargs="+", required=True,
                        help="Nomes das pastas das cidades (ex: cabo_verde nova_lima)")
    args = parser.parse_args()

    estado = args.estado.strip().upper()
    loaders = build_loader_list()

    from app.db.session import SessionLocal

    erros = []

    for city_folder in args.cidades:
        city_name = normalizar_city_name(city_folder)
        cidade_dir = Path("dados") / city_folder

        print(f"\n{'='*60}")
        print(f"Cidade: {city_name} ({estado}) | pasta: {cidade_dir}")
        print("=" * 60)

        if not cidade_dir.is_dir():
            print(f"  [ERRO] Pasta nao encontrada: {cidade_dir} -- pulando.")
            erros.append((city_name, "pasta não encontrada"))
            continue

        with tqdm(loaders, desc=f"  Datasets", unit="dataset") as pbar:
            for nome, module in pbar:
                pbar.set_postfix_str(nome)
                db = SessionLocal()
                try:
                    # Comment out any line below to skip that dataset:
                    module.carregar(cidade_dir, city_name, estado, db)
                except Exception as e:
                    db.rollback()
                    tqdm.write(f"  [ERRO] {nome}: {e}")
                    erros.append((f"{city_name}/{nome}", e))
                finally:
                    db.close()

    print(f"\n{'='*60}")
    if erros:
        print(f"[AVISO] Carga finalizada com {len(erros)} erro(s):")
        for nome, e in erros:
            print(f"   - {nome}: {e}")
    else:
        print("[OK] Carga finalizada com sucesso.")
    print("=" * 60)


if __name__ == "__main__":
    main()
