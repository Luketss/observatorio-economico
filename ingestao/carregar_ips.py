"""
Ingestion script for IPS (Indice de Progresso Social) data.

Usage:
    python -m ingestao.carregar_ips --ano 2024
    python -m ingestao.carregar_ips --ano 2024 2025
    python -m ingestao.carregar_ips --ano 2024 --estado MG
"""
import argparse
import csv
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.ips import IpsMunicipio
from ingestao.utils import obter_ou_criar_municipio

DADOS_DIR = Path("dados/ips")

COLUMN_MAP = {
    "Area (km2)": "area_km2",
    "Area (km²)": "area_km2",
    "Área (km²)": "area_km2",
    "Populacao 2022": "populacao",
    "População 2022": "populacao",
    "PIB per capita 2021": "pib_per_capita",
    "Índice de Progresso Social": "ips_geral",
    "Indice de Progresso Social": "ips_geral",
    "Necessidades Humanas Básicas": "necessidades_humanas_basicas",
    "Fundamentos do Bem-estar": "fundamentos_bem_estar",
    "Oportunidades": "oportunidades",
    "Nutrição e Cuidados Médicos Básicos": "nutricao_cuidados_medicos",
    "Água e Saneamento": "agua_saneamento",
    "Agua e Saneamento": "agua_saneamento",
    "Moradia": "moradia",
    "Segurança Pessoal": "seguranca_pessoal",
    "Acesso ao Conhecimento Básico": "acesso_conhecimento_basico",
    "Acesso à Informação e Comunicação": "acesso_informacao_comunicacao",
    "Saúde e Bem-estar": "saude_bem_estar",
    "Qualidade do Meio Ambiente": "qualidade_meio_ambiente",
    "Direitos Individuais": "direitos_individuais",
    "Liberdades Individuais e de Escolha": "liberdades_individuais",
    "Inclusão Social": "inclusao_social",
    "Acesso à Educação Superior": "acesso_educacao_superior",
    "Cobertura Vacinal (Poliomielite)": "cobertura_vacinal_poliomielite",
    "Hospitalizações por Condições Sensíveis à Atenção Primária": "hospitalizacoes_csa",
    "Mortalidade Ajustada por Condições Sensíveis à Atenção Primária": "mortalidade_ajustada_csa",
    "Mortalidade Infantil até 5 Anos": "mortalidade_infantil_5_anos",
    "Subnutrição": "subnutricao",
    "Abastecimento de Água via Rede de Distribuição": "abastecimento_agua_rede",
    "Esgotamento Sanitário Adequado": "esgotamento_sanitario_adequado",
    "Índice de Abastecimento de Água": "indice_abastecimento_agua",
    "Índice de Perdas de Água na Distribuição": "indice_perdas_agua",
    "Domicílios com Coleta de Resíduos Adequada": "domicilios_coleta_residuos",
    "Domicílios com Iluminação Elétrica Adequada": "domicilios_iluminacao_eletrica",
    "Domicílios com Paredes Adequadas": "domicilios_paredes_adequadas",
    "Domicílios com Piso Adequado": "domicilios_piso_adequado",
    "Assassinatos de Jovens": "assassinatos_jovens",
    "Assassinatos de Mulheres": "assassinatos_mulheres",
    "Homicídios": "homicidios",
    "Mortes por Acidente de Transporte": "mortes_acidente_transporte",
    "Abandono no Ensino Fundamental": "abandono_ensino_fundamental",
    "Abandono no Ensino Médio": "abandono_ensino_medio",
    "Evasão no Ensino Médio": "evasao_ensino_medio",
    "Distorção Idade-Série no Ensino Médio": "distorcao_idade_serie",
    "Ideb Ensino Fundamental": "ideb_ensino_fundamental",
    "Reprovação Escolar no Ensino Médio": "reprovacao_escolar_medio",
    "Cobertura de Internet Móvel (4G/5G)": "cobertura_internet_movel",
    "Densidade de Internet Banda Larga Fixa": "densidade_internet_banda_larga",
    "Densidade de Telefonia Móvel": "densidade_telefonia_movel",
    "Qualidade de Internet Móvel": "qualidade_internet_movel",
    "Consumo de Alimentos Ultraprocessados": "consumo_alimentos_ultraprocessados",
    "Expectativa de Vida": "expectativa_vida",
    "Mortalidade entre 15 e 50 anos": "mortalidade_15_50_anos",
    "Mortalidade por Doenças Crônicas Não Transmissíveis": "mortalidade_dcnt",
    "Obesidade": "obesidade",
    "Suicídios": "suicidios",
    "Áreas Verdes Urbanas": "areas_verdes_urbanas",
    "Emissões de CO₂e por Habitante": "emissoes_co2_habitante",
    "Focos de Calor": "focos_calor",
    "Índice de Vulnerabilidade Climática dos Municípios (IVCM)": "ivcm",
    "Supressão da Vegetação Primária e Secundária": "supressao_vegetacao",
    "Acesso a Programas de Direitos Humanos": "acesso_prog_direitos_humanos",
    "Existência de Ações para Direitos de Minorias": "acoes_direitos_minorias",
    "Índice de Atendimento à Demanda de Justiça": "atendimento_demanda_justica",
    "Resposta a Processos Previdenciários": "resposta_processos_previdenciarios",
    "Resposta a Processos Familiares": "resposta_processos_familiares",
    "Taxa de Congestionamento Líquido de Processos": "taxa_congestionamento_processos",
    "Acesso à Cultura, Lazer e Esporte": "acesso_cultura_lazer_esporte",
    "Gravidez na Adolescência (<19 anos)": "gravidez_adolescencia",
    "Índice de Vulnerabilidade das Famílias do Cadastro Único (IVCAD)": "ivcad",
    "Praças e Parques em Áreas Urbanas": "pracas_parques_urbanas",
    "Famílias em Situação de Rua": "familias_situacao_rua",
    "Paridade de Gênero na Câmara Municipal": "paridade_genero_camara",
    "Paridade de Negros na Câmara Municipal": "paridade_negros_camara",
    "Violência contra Indígenas": "violencia_indigenas",
    "Violência contra Mulheres": "violencia_mulheres",
    "Violência contra Negros": "violencia_negros",
    "Empregados com Ensino Superior": "empregados_ensino_superior",
    "Mulheres Empregadas com Ensino Superior": "mulheres_empregadas_ensino_superior",
    "Nota Mediana do Enem": "nota_mediana_enem",
}


def _parse_float(val: str) -> float | None:
    v = val.strip().replace(",", ".")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _parse_int(val: str) -> int | None:
    f = _parse_float(val)
    return int(f) if f is not None else None


def carregar(caminho: Path, ano: int, db: Session, estado: str | None = None) -> None:
    inserted = skipped = 0
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            uf = row.get("UF", "").strip().upper()
            if estado and uf != estado.upper():
                continue

            codigo_ibge = row.get("Código IBGE", "").strip()
            city_name = row.get("Município", row.get("Municipio", "")).strip()
            # Strip state suffix if present e.g. "Cabo Verde (MG)"
            if "(" in city_name:
                city_name = city_name[:city_name.index("(")].strip()

            municipio = obter_ou_criar_municipio(db, city_name, uf, codigo_ibge or None)

            existing = db.query(IpsMunicipio).filter(
                IpsMunicipio.municipio_id == municipio.id,
                IpsMunicipio.ano == ano,
            ).first()
            if existing:
                skipped += 1
                continue

            kwargs = {"municipio_id": municipio.id, "ano": ano}
            kwargs["area_km2"] = _parse_float(row.get("Área (km²)", row.get("Area (km2)", "")))
            kwargs["populacao"] = _parse_int(row.get("População 2022", row.get("Populacao 2022", "")))
            kwargs["pib_per_capita"] = _parse_float(row.get("PIB per capita 2021", ""))

            for csv_col, model_field in COLUMN_MAP.items():
                if csv_col in row and model_field not in kwargs:
                    kwargs[model_field] = _parse_float(row[csv_col])

            db.add(IpsMunicipio(**kwargs))
            inserted += 1

    db.commit()
    print(f"  IPS {ano}: {inserted} inseridas, {skipped} ignoradas.")


def main():
    parser = argparse.ArgumentParser(description="Carga de dados IPS")
    parser.add_argument("--ano", nargs="+", type=int, required=True, help="Ano(s) a carregar (ex: 2024 2025)")
    parser.add_argument("--estado", default=None, help="Filtrar por UF (ex: MG)")
    args = parser.parse_args()

    from app.db.session import SessionLocal
    for ano in args.ano:
        caminho = DADOS_DIR / f"ips_brasil_municipios_{ano}.csv"
        if not caminho.exists():
            print(f"[AVISO] Arquivo nao encontrado: {caminho}")
            continue
        print(f"\nCarregando IPS {ano}...")
        db = SessionLocal()
        try:
            carregar(caminho, ano, db, estado=args.estado)
        except Exception as e:
            db.rollback()
            print(f"[ERRO] {e}")
            raise
        finally:
            db.close()


if __name__ == "__main__":
    main()
