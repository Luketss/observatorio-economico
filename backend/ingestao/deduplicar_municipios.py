"""
Script to merge duplicate municipalities caused by underscore vs space naming.
Runs all necessary UPDATE statements to reassign data from the duplicate (underscore)
municipio to the canonical one (with spaces), then deletes the duplicate.

Usage (from project root with venv active):
  python ingestao/deduplicar_municipios.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import SessionLocal
from app.models.municipio import Municipio
from sqlalchemy import text

# Tables that have a municipio_id foreign key
TABLES_WITH_MUNICIPIO_FK = [
    "arrecadacao_mensal",
    "pib_anual",
    "caged_movimentacao",
    "caged_por_sexo",
    "caged_por_raca",
    "caged_salario",
    "caged_por_cnae",
    "rais_vinculos",
    "rais_por_sexo",
    "rais_por_raca",
    "rais_por_cnae",
    "bolsa_familia_resumo",
    "pe_de_meia_resumo",
    "inss_anual",
    "estban_mensal",
    "comex_mensal",
    "empresas",
    "insights_ia",
    "marcos_mandato",
    "dashboard_cards_custom",
    "usuarios",
]


def normalizar(nome: str) -> str:
    return nome.strip().replace("_", " ").upper()


def main():
    db = SessionLocal()
    try:
        municipios = db.query(Municipio).order_by(Municipio.nome).all()

        # Group by normalized name
        grupos: dict[str, list[Municipio]] = {}
        for m in municipios:
            chave = normalizar(m.nome)
            grupos.setdefault(chave, []).append(m)

        duplicatas = {k: v for k, v in grupos.items() if len(v) > 1}

        if not duplicatas:
            print("Nenhuma duplicata encontrada.")
            return

        for nome_normalizado, lista in duplicatas.items():
            # Keep the one with a space (canonical), or the lowest id
            lista_sorted = sorted(lista, key=lambda m: ("_" in m.nome, m.id))
            canonical = lista_sorted[0]
            duplicates = lista_sorted[1:]

            print(f"\n[{nome_normalizado}]")
            print(f"  Mantendo:   id={canonical.id}  nome='{canonical.nome}'")
            for dup in duplicates:
                print(f"  Removendo:  id={dup.id}  nome='{dup.nome}'")

                for table in TABLES_WITH_MUNICIPIO_FK:
                    result = db.execute(
                        text(
                            f"UPDATE {table} SET municipio_id = :keep WHERE municipio_id = :dup"
                        ),
                        {"keep": canonical.id, "dup": dup.id},
                    )
                    if result.rowcount:
                        print(f"    {table}: {result.rowcount} linhas atualizadas")

                # Also update canonical name to normalized version (with spaces)
                canonical.nome = nome_normalizado

                db.delete(dup)

            db.commit()
            print(f"  Concluído para '{nome_normalizado}'.")

        print("\nDeduplicação finalizada com sucesso.")
    except Exception as e:
        db.rollback()
        print(f"ERRO: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
