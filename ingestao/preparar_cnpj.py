"""
preparar_cnpj.py
----------------
Merges the 3 raw CNPJ source CSVs into per-city files compatible with
carregar_cnpj.py.

Sources (dados/):
  - estabelecimentos_7_CIDADES.csv  (base table — has Nome_Cidade)
  - empresas_capital_7_CIDADES.csv  (razao_social, capital_social, porte)
  - simples_mei_7_CIDADES.csv       (opcao_simples, opcao_mei)

Output: dados/Pacote_CNPJ_Completo_Corrigido/CNPJ_Completo_{CityName}.csv
        one file per unique Nome_Cidade, semicolon-delimited, 16 columns.

Target column order:
  cnpj_basico;cnpj_ordem;cnpj_dv;nome_fantasia;situacao;data_situacao;
  data_inicio;cnae_fiscal;bairro;municipio;Nome_Cidade;razao_social;
  capital_social;porte;opcao_simples;opcao_mei
"""

import os
import unicodedata

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DADOS_DIR = os.path.join(BASE_DIR, "dados")
OUTPUT_DIR = os.path.join(DADOS_DIR, "Pacote_CNPJ_Completo_Corrigido")

ESTAB_PATH = os.path.join(DADOS_DIR, "estabelecimentos_7_CIDADES.csv")
EMPR_PATH  = os.path.join(DADOS_DIR, "empresas_capital_7_CIDADES.csv")
SIMP_PATH  = os.path.join(DADOS_DIR, "simples_mei_7_CIDADES.csv")

TARGET_COLS = [
    "cnpj_basico", "cnpj_ordem", "cnpj_dv", "nome_fantasia",
    "situacao", "data_situacao", "data_inicio", "cnae_fiscal",
    "bairro", "municipio", "Nome_Cidade",
    "razao_social", "capital_social", "porte",
    "opcao_simples", "opcao_mei",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def sanitize_city_name(name: str) -> str:
    """Convert city name to filename-safe form: 'Nova Serrana' → 'Nova_Serrana'."""
    # Normalize unicode (remove accents)
    normalized = unicodedata.normalize("NFD", name)
    ascii_name = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return ascii_name.replace(" ", "_")


def read_csv(path: str) -> pd.DataFrame:
    print(f"  Reading {os.path.basename(path)} ...", end=" ", flush=True)
    df = pd.read_csv(path, sep=";", dtype=str, encoding="utf-8", keep_default_na=False)
    print(f"{len(df):,} rows, columns: {list(df.columns)}")
    return df


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\n=== Loading source files ===")
    estab = read_csv(ESTAB_PATH)
    empr  = read_csv(EMPR_PATH)
    simp  = read_csv(SIMP_PATH)

    # Drop rows without cnpj_basico
    for name, df in [("estabelecimentos", estab), ("empresas", empr), ("simples_mei", simp)]:
        before = len(df)
        df.dropna(subset=["cnpj_basico"], inplace=True)
        df = df[df["cnpj_basico"].str.strip() != ""]
        dropped = before - len(df)
        if dropped:
            print(f"  Dropped {dropped} rows with empty cnpj_basico from {name}")

    # Deduplicate simples_mei to prevent row explosion on join
    before = len(simp)
    simp = simp.drop_duplicates(subset=["cnpj_basico"], keep="first")
    if len(simp) < before:
        print(f"  Deduplicated simples_mei: {before - len(simp)} duplicate cnpj_basico removed")

    # Deduplicate empresas too
    before = len(empr)
    empr = empr.drop_duplicates(subset=["cnpj_basico"], keep="first")
    if len(empr) < before:
        print(f"  Deduplicated empresas: {before - len(empr)} duplicate cnpj_basico removed")

    print("\n=== Joining tables ===")
    merged = estab.merge(empr, on="cnpj_basico", how="left")
    print(f"  After empresas join: {len(merged):,} rows")

    merged = merged.merge(simp, on="cnpj_basico", how="left")
    print(f"  After simples_mei join: {len(merged):,} rows")

    # Fill NaN introduced by left joins with empty string
    merged.fillna("", inplace=True)

    # Ensure all target columns exist
    for col in TARGET_COLS:
        if col not in merged.columns:
            print(f"  WARNING: column '{col}' not found — filling with empty string")
            merged[col] = ""

    merged = merged[TARGET_COLS]

    print(f"\n  Total rows after merge: {len(merged):,}")

    # ---------------------------------------------------------------------------
    # Split by city and write output files
    # ---------------------------------------------------------------------------
    print("\n=== Writing per-city files ===")
    cities = merged["Nome_Cidade"].unique()
    total_written = 0

    for city in sorted(cities):
        if not city or str(city).strip() == "":
            print(f"  Skipping rows with empty Nome_Cidade ({len(merged[merged['Nome_Cidade'] == city])} rows)")
            continue

        city_df = merged[merged["Nome_Cidade"] == city].copy()
        filename = f"CNPJ_Completo_{sanitize_city_name(str(city))}.csv"
        out_path = os.path.join(OUTPUT_DIR, filename)

        city_df.to_csv(out_path, sep=";", index=False, encoding="utf-8")
        total_written += len(city_df)
        print(f"  {filename}: {len(city_df):,} rows → {out_path}")

    print(f"\n=== Done ===")
    print(f"  Cities written: {len([c for c in cities if c and str(c).strip()])}")
    print(f"  Total rows written: {total_written:,}")
    print(f"  Output directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
