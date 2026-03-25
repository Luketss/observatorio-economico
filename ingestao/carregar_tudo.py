"""
Master ingestion script — runs all dataset loaders in order.

Usage (from project root):
    python -m ingestao.carregar_tudo
"""

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

SCRIPTS = [
    ("Arrecadação", arrecadacao.main),
    ("PIB", pib.main),
    ("CAGED", caged.main),
    ("RAIS", rais.main),
    ("Bolsa Família", bolsa_familia.main),
    ("Pé-de-Meia", pe_de_meia.main),
    ("INSS", inss.main),
    ("Estban", estban.main),
    ("Comex", comex.main),
    ("CNPJ", cnpj.main),
]


def main():
    print("=" * 50)
    print("Iniciando carga completa de dados")
    print("=" * 50)

    erros = []

    for nome, fn in SCRIPTS:
        print(f"\n--- {nome} ---")
        try:
            fn()
        except Exception as e:
            print(f"❌ Erro ao carregar {nome}: {e}")
            erros.append((nome, e))

    print("\n" + "=" * 50)
    if erros:
        print(f"⚠️  Carga finalizada com {len(erros)} erro(s):")
        for nome, e in erros:
            print(f"   - {nome}: {e}")
    else:
        print("✅ Carga completa finalizada com sucesso.")
    print("=" * 50)


if __name__ == "__main__":
    main()
