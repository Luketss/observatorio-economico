# ==============================================================================
# 🚀 EXTRATOR - BOLSA FAMÍLIA E PÉ-DE-MEIA (COM RETOMADA AUTOMÁTICA SEGURA)
# ==============================================================================

import gc
import os
import zipfile
from datetime import datetime

import pandas as pd
import requests
from dateutil.relativedelta import relativedelta
from tqdm.auto import tqdm

# Removido uso do Google Colab (execução local)

# ==============================================================================
# ⚙️ 1. CONFIGURAÇÕES GERAIS
# ==============================================================================

# Diretório base local (mesmo diretório do script)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PASTA_BOLSA_FAMILIA = os.path.join(BASE_DIR, "dados", "Bolsa_Familia")
PASTA_PE_DE_MEIA = os.path.join(BASE_DIR, "dados", "Pe_de_Meia")

ZIP_TEMP_BF = os.path.join(BASE_DIR, "temp_bf.zip")
ZIP_TEMP_PM = os.path.join(BASE_DIR, "temp_pm.zip")

DATA_INICIO_PM = datetime(2024, 1, 1)
# Pega até o mês anterior ao atual
DATA_FIM_SOCIAIS = datetime.now() - relativedelta(months=1)

# ==============================================================================
# 🛠️ 2. FUNÇÕES AUXILIARES COMPARTILHADAS
# ==============================================================================


def preparar_ambiente_drive():
    """Cria as pastas locais separadas por programa."""
    print("\n🔄 Criando estrutura de diretórios local...")

    os.makedirs(PASTA_BOLSA_FAMILIA, exist_ok=True)
    os.makedirs(PASTA_PE_DE_MEIA, exist_ok=True)

    print("✅ Estrutura de diretórios criada com sucesso no diretório local.")


def limpar_memoria():
    """Força o coletor de lixo a liberar a memória RAM do Colab."""
    gc.collect()


def download_zip_programas_sociais(url, caminho_destino, desc):
    """Baixa arquivos ZIP do Portal da Transparência direto para o disco."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    try:
        r = requests.get(url, stream=True, headers=headers, timeout=120)
        if r.status_code != 200:
            return False

        total_size = int(r.headers.get("content-length", 0))

        with open(caminho_destino, "wb") as f:
            with tqdm(
                total=total_size, unit="B", unit_scale=True, desc=desc, leave=False
            ) as bar:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
                        bar.update(len(chunk))
        return True
    except Exception as e:
        print(f"Erro no download: {e}")
        return False


# ==============================================================================
# 🥣 3. MÓDULO: BOLSA FAMÍLIA E AUXÍLIO BRASIL
# ==============================================================================


def pipeline_bolsa_familia():
    print(f"\n" + "=" * 60)
    print("🥣 INICIANDO EXTRAÇÃO: BOLSA FAMÍLIA E AUXÍLIO BRASIL")
    print("=" * 60)

    fases = [
        {
            "nome": "Auxílio Brasil",
            "url_base": "https://portaldatransparencia.gov.br/download-de-dados/auxilio-brasil",
            "inicio": datetime(2022, 1, 1),
            "fim": datetime(2023, 2, 28),
            "eh_novo_bolsa": False,
        },
        {
            "nome": "Novo Bolsa Família",
            "url_base": "https://portaldatransparencia.gov.br/download-de-dados/novo-bolsa-familia",
            "inicio": datetime(2023, 3, 1),
            "fim": DATA_FIM_SOCIAIS,
            "eh_novo_bolsa": True,
        },
    ]

    total_registros = 0

    for fase in fases:
        print(f"\n🚀 Iniciando fase: {fase['nome']}")
        curr = fase["inicio"]

        while curr <= fase["fim"]:
            mes_str = curr.strftime("%Y%m")

            # --- TRAVA DE SEGURANÇA PARA RETOMADA ---
            arquivo_mes_bf = os.path.join(
                PASTA_BOLSA_FAMILIA, f"bolsa_familia_{mes_str}.csv"
            )
            marcador_done = arquivo_mes_bf + ".done"

            if os.path.exists(marcador_done):
                print(f"⏭️ Mês {mes_str} já foi 100% processado. Pulando...")
                curr += relativedelta(months=1)
                continue

            # Se o CSV existir mas o .done NÃO existir, a extração anterior falhou no meio
            if os.path.exists(arquivo_mes_bf):
                print(
                    f"⚠️ Arquivo corrompido/incompleto detectado em {mes_str}. Apagando para recomeçar..."
                )
                os.remove(arquivo_mes_bf)
            # -----------------------------------------

            print(f"\n📅 Processando: {mes_str}...")

            url = f"{fase['url_base']}/{mes_str}"
            if not download_zip_programas_sociais(
                url, ZIP_TEMP_BF, f"⬇️ Baixando {mes_str}"
            ):
                print(f"⚠️ Mês {mes_str} indisponível.")
                curr += relativedelta(months=1)
                continue

            try:
                with zipfile.ZipFile(ZIP_TEMP_BF, "r") as z:
                    csv_file = [n for n in z.namelist() if n.endswith(".csv")][0]
                    with z.open(csv_file) as f:
                        chunks = pd.read_csv(
                            f, sep=";", encoding="latin-1", chunksize=500000, dtype=str
                        )
                        registros_mes = 0

                        for chunk in chunks:
                            df_chunk = chunk.copy()

                            df_chunk["Data"] = pd.to_datetime(
                                df_chunk["MÊS COMPETÊNCIA"], format="%Y%m"
                            ).dt.strftime("%d/%m/%Y")
                            col_valor = "VALOR PARCELA"

                            if col_valor in df_chunk.columns:
                                df_chunk[col_valor] = (
                                    df_chunk[col_valor]
                                    .str.replace(".", "", regex=False)
                                    .str.replace(",", ".", regex=False)
                                )
                                df_chunk["Valor_Num"] = pd.to_numeric(
                                    df_chunk[col_valor], errors="coerce"
                                ).fillna(0)
                            else:
                                df_chunk["Valor_Num"] = 0.0

                            if fase["eh_novo_bolsa"]:
                                df_chunk["Primeira Infância"] = df_chunk[
                                    "Valor_Num"
                                ].apply(
                                    lambda val: (
                                        int((val - 600) // 150) * 150.0
                                        if val > 600
                                        else 0.0
                                    )
                                )
                                df_chunk["Valor Bolsa"] = (
                                    df_chunk["Valor_Num"]
                                    - df_chunk["Primeira Infância"]
                                )
                            else:
                                df_chunk["Primeira Infância"] = 0.0
                                df_chunk["Valor Bolsa"] = df_chunk["Valor_Num"]

                            cols_finais = [
                                "MÊS COMPETÊNCIA",
                                "Data",
                                "UF",
                                "NOME MUNICÍPIO",
                                "NIS FAVORECIDO",
                                "VALOR PARCELA",
                                "Primeira Infância",
                                "Valor Bolsa",
                            ]
                            df_final = df_chunk[
                                [c for c in cols_finais if c in df_chunk.columns]
                            ]

                            header = not os.path.exists(arquivo_mes_bf)
                            df_final.to_csv(
                                arquivo_mes_bf,
                                mode="a",
                                index=False,
                                sep=";",
                                header=header,
                                encoding="utf-8-sig",
                            )
                            registros_mes += len(df_final)

                total_registros += registros_mes
                print(f"✅ {registros_mes:,} registros salvos para {mes_str}.")

                # SUCESSO! Cria o arquivo marcador indicando que este mês está completo
                with open(marcador_done, "w") as f_done:
                    f_done.write("ok")

            except Exception as e:
                print(f"❌ Erro ao processar {mes_str}: {e}")

            if os.path.exists(ZIP_TEMP_BF):
                os.remove(ZIP_TEMP_BF)
            limpar_memoria()
            curr += relativedelta(months=1)

    print(
        f"\n🏁 BOLSA FAMÍLIA FINALIZADO! Total processado na sessão: {total_registros:,} registros."
    )


# ==============================================================================
# 👟 4. MÓDULO: PÉ-DE-MEIA
# ==============================================================================


def pipeline_pe_de_meia():
    print(f"\n" + "=" * 60)
    print(f"🚀 INICIANDO EXTRAÇÃO: PÉ-DE-MEIA")
    print(f"=" * 60)

    curr = DATA_INICIO_PM
    total_registros_geral = 0

    while curr <= DATA_FIM_SOCIAIS:
        mes_str = curr.strftime("%Y%m")

        # --- TRAVA DE SEGURANÇA PARA RETOMADA ---
        arquivo_mes_pm = os.path.join(PASTA_PE_DE_MEIA, f"pe_de_meia_{mes_str}.csv")
        marcador_done = arquivo_mes_pm + ".done"

        if os.path.exists(marcador_done):
            print(f"⏭️ Mês {mes_str} já foi 100% processado. Pulando...")
            curr += relativedelta(months=1)
            continue

        if os.path.exists(arquivo_mes_pm):
            print(
                f"⚠️ Arquivo corrompido/incompleto detectado em {mes_str}. Apagando para recomeçar..."
            )
            os.remove(arquivo_mes_pm)
        # -----------------------------------------

        print(f"\n📅 Processando: {mes_str}...")

        url = f"https://portaldatransparencia.gov.br/download-de-dados/pe-de-meia/{mes_str}"
        if not download_zip_programas_sociais(
            url, ZIP_TEMP_PM, f"⬇️ Baixando {mes_str}"
        ):
            print(f"⚠️ Mês {mes_str} indisponível.")
            curr += relativedelta(months=1)
            continue

        try:
            with zipfile.ZipFile(ZIP_TEMP_PM, "r") as z:
                lista_csvs = [n for n in z.namelist() if n.endswith(".csv")]

                if not lista_csvs:
                    print(f"❌ ZIP do mês {mes_str} está vazio.")
                else:
                    csv_alvo = lista_csvs[0]
                    registros_mes = 0

                    with z.open(csv_alvo) as f:
                        chunks = pd.read_csv(
                            f, sep=";", encoding="latin-1", chunksize=500000, dtype=str
                        )

                        for chunk in chunks:
                            df_chunk = chunk.copy()

                            cols_valor = [c for c in df_chunk.columns if "VALOR" in c]
                            for col in cols_valor:
                                df_chunk[col] = (
                                    df_chunk[col]
                                    .str.replace(".", "", regex=False)
                                    .str.replace(",", ".", regex=False)
                                )

                            header = not os.path.exists(arquivo_mes_pm)
                            df_chunk.to_csv(
                                arquivo_mes_pm,
                                mode="a",
                                index=False,
                                sep=";",
                                header=header,
                                encoding="utf-8-sig",
                            )
                            registros_mes += len(df_chunk)

                total_registros_geral += registros_mes
                print(f"✅ {registros_mes:,} registros processados para {mes_str}.")

                # SUCESSO! Cria o arquivo marcador
                with open(marcador_done, "w") as f_done:
                    f_done.write("ok")

        except Exception as e:
            print(f"❌ Erro ao processar o arquivo de {mes_str}: {e}")

        if os.path.exists(ZIP_TEMP_PM):
            os.remove(ZIP_TEMP_PM)
        limpar_memoria()
        curr += relativedelta(months=1)

    print(
        f"\n🏁 PÉ-DE-MEIA FINALIZADO! Total processado na sessão: {total_registros_geral:,} registros."
    )


# ==============================================================================
# 🎯 EXECUÇÃO PRINCIPAL
# ==============================================================================
if __name__ == "__main__":
    print("Iniciando a rotina de extração...\n")

    preparar_ambiente_drive()
    pipeline_bolsa_familia()
    pipeline_pe_de_meia()

    print(
        "\n🎉 EXTRAÇÃO CONCLUÍDA! Todos os arquivos estão na pasta 'dados' deste diretório."
    )
