"""
Master ingestion script — runs all dataset loaders in order.

Usage (from project root):
    python -m ingestao.carregar_tudo --estado MG --cidades cabo_verde
    python -m ingestao.carregar_tudo --estado MG --cidades cabo_verde nova_lima --ibge 3105905 3136702
    python -m ingestao.carregar_tudo --estado SP --cidades city_sp --ibge 3550308
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
from ingestao.utils import obter_ou_criar_municipio


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


def _garantir_municipio(city_name: str, estado: str, codigo_ibge: str | None, SessionLocal) -> None:
    """Ensure the municipio exists with the correct IBGE code before loaders run."""
    db = SessionLocal()
    try:
        municipio = obter_ou_criar_municipio(db, city_name, estado, codigo_ibge)
        if codigo_ibge and not municipio.codigo_ibge:
            municipio.codigo_ibge = codigo_ibge
            db.commit()
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Carga de dados do Observatorio Economico")
    parser.add_argument("--estado", required=True, help="UF do estado (ex: MG, SP)")
    parser.add_argument("--cidades", nargs="+", required=True,
                        help="Nomes das pastas das cidades (ex: cabo_verde nova_lima)")
    parser.add_argument("--ibge", nargs="*", default=None,
                        help="Codigos IBGE correspondentes a cada cidade (mesma ordem que --cidades)")
    args = parser.parse_args()

    estado = args.estado.strip().upper()
    ibge_codes = args.ibge or []

    if ibge_codes and len(ibge_codes) != len(args.cidades):
        parser.error(f"--ibge deve ter o mesmo numero de valores que --cidades "
                     f"({len(args.cidades)} cidades, {len(ibge_codes)} codigos IBGE)")

    loaders = build_loader_list()

    from app.db.session import SessionLocal

    erros = []

    for i, city_folder in enumerate(args.cidades):
        city_name = normalizar_city_name(city_folder)
        cidade_dir = Path("dados") / city_folder
        codigo_ibge = ibge_codes[i] if ibge_codes else None

        print(f"\n{'='*60}")
        ibge_info = f" | IBGE: {codigo_ibge}" if codigo_ibge else ""
        print(f"Cidade: {city_name} ({estado}){ibge_info} | pasta: {cidade_dir}")
        print("=" * 60)

        if not cidade_dir.is_dir():
            print(f"  [ERRO] Pasta nao encontrada: {cidade_dir} -- pulando.")
            erros.append((city_name, "pasta não encontrada"))
            continue

        _garantir_municipio(city_name, estado, codigo_ibge, SessionLocal)

        with tqdm(loaders, desc="  Datasets", unit="dataset") as pbar:
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
