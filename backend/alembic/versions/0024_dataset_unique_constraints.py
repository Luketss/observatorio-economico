"""dedup existing rows and add unique constraints on every dataset table's
natural key, so future ingest runs cannot silently insert duplicates.

Pattern follows `ips_municipio`, which already has its constraint.

The `DELETE … USING …` step keeps the row with the lowest `id` per group —
safe because dataset rows are interchangeable when their natural key matches
(loaders previously did a check-and-skip on the same tuple).

Revision ID: 0024_dataset_unique_constraints
Revises: 0023_add_is_demo_to_municipios
Create Date: 2026-05-17
"""

from alembic import op


revision = "0024_dataset_unique_constraints"
down_revision = "0023_add_is_demo_to_municipios"
branch_labels = None
depends_on = None


# (table_name, constraint_name, natural_key_columns)
CONSTRAINTS: list[tuple[str, str, list[str]]] = [
    ("arrecadacao_mensal",                "uq_arrecadacao_mensal_municipio_ano_mes",          ["municipio_id", "ano", "mes"]),
    ("pib_anual",                         "uq_pib_anual_municipio_ano_tipo",                  ["municipio_id", "ano", "tipo_dado"]),
    ("bolsa_familia_resumo",              "uq_bolsa_familia_resumo_municipio_ano_mes",        ["municipio_id", "ano", "mes"]),
    ("pe_de_meia_resumo",                 "uq_pe_de_meia_resumo_municipio_ano_mes",           ["municipio_id", "ano", "mes"]),
    ("pe_de_meia_etapa",                  "uq_pe_de_meia_etapa_municipio_ano_mes_etapa_tipo", ["municipio_id", "ano", "mes", "etapa_ensino", "tipo_incentivo"]),
    ("inss_anual",                        "uq_inss_anual_municipio_ano_categoria",            ["municipio_id", "ano", "categoria"]),
    ("estban_mensal",                     "uq_estban_mensal_municipio_data",                  ["municipio_id", "data_referencia"]),
    ("estban_por_instituicao",            "uq_estban_por_instituicao_municipio_data_nome",    ["municipio_id", "data_referencia", "nome_instituicao"]),
    ("comex_mensal",                      "uq_comex_mensal_municipio_ano_mes_tipo",           ["municipio_id", "ano", "mes", "tipo_operacao"]),
    ("comex_por_produto",                 "uq_comex_por_produto_municipio_ano_tipo_produto",  ["municipio_id", "ano", "tipo_operacao", "produto"]),
    ("comex_por_pais",                    "uq_comex_por_pais_municipio_ano_tipo_pais",        ["municipio_id", "ano", "tipo_operacao", "pais"]),
    ("empresas",                          "uq_empresas_municipio_cnpj",                       ["municipio_id", "cnpj_basico"]),
    ("pix_mensal",                        "uq_pix_mensal_municipio_ano_mes",                  ["municipio_id", "ano", "mes"]),

    # CAGED
    ("caged_movimentacao",                "uq_caged_movimentacao_municipio_ano_mes",          ["municipio_id", "ano", "mes"]),
    ("caged_por_sexo",                    "uq_caged_por_sexo_municipio_ano_mes_sexo",         ["municipio_id", "ano", "mes", "sexo"]),
    ("caged_por_raca",                    "uq_caged_por_raca_municipio_ano_mes_raca",         ["municipio_id", "ano", "mes", "raca_cor"]),
    ("caged_salario",                     "uq_caged_salario_municipio_ano_mes",               ["municipio_id", "ano", "mes"]),
    ("caged_por_cnae",                    "uq_caged_por_cnae_municipio_ano_mes_secao",        ["municipio_id", "ano", "mes", "secao"]),
    ("caged_por_escolaridade",            "uq_caged_por_escolaridade_municipio_ano_mes_grau", ["municipio_id", "ano", "mes", "grau_instrucao"]),
    ("caged_por_faixa_etaria",            "uq_caged_por_faixa_etaria_municipio_ano_mes_faixa",["municipio_id", "ano", "mes", "faixa_etaria"]),
    ("caged_por_tipo_movimentacao",       "uq_caged_por_tipo_movimentacao_municipio_ano_mes_tipo", ["municipio_id", "ano", "mes", "tipo_movimentacao"]),
    ("caged_por_tipo_deficiencia",        "uq_caged_por_tipo_deficiencia_municipio_ano_mes_tipo", ["municipio_id", "ano", "mes", "tipo_deficiencia"]),
    ("caged_por_tamanho_estabelecimento", "uq_caged_por_tamanho_estabelecimento_municipio_ano_mes_tamanho", ["municipio_id", "ano", "mes", "tamanho"]),
    ("caged_por_tipo_empregador",         "uq_caged_por_tipo_empregador_municipio_ano_mes_tipo", ["municipio_id", "ano", "mes", "tipo_empregador"]),
    ("caged_por_tipo_estabelecimento",    "uq_caged_por_tipo_estabelecimento_municipio_ano_mes_tipo", ["municipio_id", "ano", "mes", "tipo_estabelecimento"]),
    ("caged_indicadores_contrato",        "uq_caged_indicadores_contrato_municipio_ano",      ["municipio_id", "ano"]),

    # RAIS
    ("rais_vinculos",                     "uq_rais_vinculos_municipio_ano",                   ["municipio_id", "ano"]),
    ("rais_por_sexo",                     "uq_rais_por_sexo_municipio_ano_sexo",              ["municipio_id", "ano", "sexo"]),
    ("rais_por_raca",                     "uq_rais_por_raca_municipio_ano_raca",              ["municipio_id", "ano", "raca_cor"]),
    ("rais_por_cnae",                     "uq_rais_por_cnae_municipio_ano_secao",             ["municipio_id", "ano", "secao"]),
    ("rais_por_faixa_etaria",             "uq_rais_por_faixa_etaria_municipio_ano_faixa",     ["municipio_id", "ano", "faixa_etaria"]),
    ("rais_por_escolaridade",             "uq_rais_por_escolaridade_municipio_ano_grau",      ["municipio_id", "ano", "grau_instrucao"]),
    ("rais_por_faixa_remuneracao",        "uq_rais_por_faixa_remuneracao_municipio_ano_faixa",["municipio_id", "ano", "faixa_remuneracao_sm"]),
    ("rais_por_faixa_tempo_emprego",      "uq_rais_por_faixa_tempo_emprego_municipio_ano_faixa", ["municipio_id", "ano", "faixa_tempo_emprego"]),
    ("rais_metricas_anuais",              "uq_rais_metricas_anuais_municipio_ano",            ["municipio_id", "ano"]),
    ("rais_por_motivo_desligamento",      "uq_rais_por_motivo_desligamento_municipio_ano_motivo", ["municipio_id", "ano", "motivo"]),
    ("rais_por_tipo_admissao",            "uq_rais_por_tipo_admissao_municipio_ano_tipo",     ["municipio_id", "ano", "tipo"]),
    ("rais_por_cbo",                      "uq_rais_por_cbo_municipio_ano_cbo",                ["municipio_id", "ano", "cbo_familia"]),
    ("rais_por_tamanho_estabelecimento",  "uq_rais_por_tamanho_estabelecimento_municipio_ano_tamanho", ["municipio_id", "ano", "tamanho"]),
    ("rais_por_natureza_juridica",        "uq_rais_por_natureza_juridica_municipio_ano_grupo",["municipio_id", "ano", "grupo"]),
    ("rais_turnover_mensal",              "uq_rais_turnover_mensal_municipio_ano_mes",        ["municipio_id", "ano", "mes"]),
]


def _dedup_sql(table: str, key_columns: list[str]) -> str:
    join = " AND ".join(f"a.{c} = b.{c}" for c in key_columns)
    return f"DELETE FROM {table} a USING {table} b WHERE {join} AND a.id > b.id;"


def upgrade():
    for table, name, cols in CONSTRAINTS:
        op.execute(_dedup_sql(table, cols))
        op.create_unique_constraint(name, table, cols)


def downgrade():
    for table, name, _ in CONSTRAINTS:
        op.drop_constraint(name, table, type_="unique")
