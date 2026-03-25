"""add bolsa_familia, pe_de_meia, inss, estban, comex, empresas tables

Revision ID: 0003_new_datasets
Revises: 0002_caged_rais
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_new_datasets"
down_revision = "0002_caged_rais"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================
    # BOLSA FAMILIA
    # =========================
    op.create_table(
        "bolsa_familia_resumo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("total_beneficiarios", sa.Integer(), nullable=False),
        sa.Column("valor_total", sa.Float(), nullable=False),
        sa.Column("valor_bolsa", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_bf_municipio_id", "bolsa_familia_resumo", ["municipio_id"])
    op.create_index("ix_bf_ano", "bolsa_familia_resumo", ["ano"])
    op.create_index("ix_bf_mes", "bolsa_familia_resumo", ["mes"])

    # =========================
    # PE DE MEIA
    # =========================
    op.create_table(
        "pe_de_meia_resumo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("total_estudantes", sa.Integer(), nullable=False),
        sa.Column("valor_total", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_pdm_municipio_id", "pe_de_meia_resumo", ["municipio_id"])
    op.create_index("ix_pdm_ano", "pe_de_meia_resumo", ["ano"])
    op.create_index("ix_pdm_mes", "pe_de_meia_resumo", ["mes"])

    # =========================
    # INSS
    # =========================
    op.create_table(
        "inss_anual",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("categoria", sa.String(length=150), nullable=False),
        sa.Column("quantidade_beneficios", sa.Integer(), nullable=False),
        sa.Column("valor_anual", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_inss_municipio_id", "inss_anual", ["municipio_id"])
    op.create_index("ix_inss_ano", "inss_anual", ["ano"])
    op.create_index("ix_inss_categoria", "inss_anual", ["categoria"])

    # =========================
    # ESTBAN
    # =========================
    op.create_table(
        "estban_mensal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("data_referencia", sa.Date(), nullable=False),
        sa.Column("qtd_agencias", sa.Integer(), nullable=False),
        sa.Column("valor_operacoes_credito", sa.Float(), nullable=False),
        sa.Column("valor_depositos_vista", sa.Float(), nullable=False),
        sa.Column("valor_poupanca", sa.Float(), nullable=False),
        sa.Column("valor_depositos_prazo", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_estban_municipio_id", "estban_mensal", ["municipio_id"])
    op.create_index("ix_estban_data_ref", "estban_mensal", ["data_referencia"])

    # =========================
    # COMEX
    # =========================
    op.create_table(
        "comex_mensal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("tipo_operacao", sa.String(length=10), nullable=False),
        sa.Column("valor_usd", sa.Float(), nullable=False),
        sa.Column("peso_kg", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_comex_municipio_id", "comex_mensal", ["municipio_id"])
    op.create_index("ix_comex_ano", "comex_mensal", ["ano"])
    op.create_index("ix_comex_mes", "comex_mensal", ["mes"])
    op.create_index("ix_comex_tipo_op", "comex_mensal", ["tipo_operacao"])

    # =========================
    # EMPRESAS (CNPJ)
    # =========================
    op.create_table(
        "empresas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("cnpj_basico", sa.String(length=8), nullable=False),
        sa.Column("razao_social", sa.String(length=150), nullable=False),
        sa.Column("nome_fantasia", sa.String(length=150), nullable=True),
        sa.Column("situacao", sa.String(length=2), nullable=True),
        sa.Column("data_inicio", sa.Date(), nullable=True),
        sa.Column("cnae_fiscal", sa.String(length=7), nullable=True),
        sa.Column("porte", sa.String(length=2), nullable=True),
        sa.Column("capital_social", sa.Float(), nullable=True),
        sa.Column("opcao_simples", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("opcao_mei", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_empresas_municipio_id", "empresas", ["municipio_id"])
    op.create_index("ix_empresas_cnpj_basico", "empresas", ["cnpj_basico"])


def downgrade() -> None:
    op.drop_index("ix_empresas_cnpj_basico", "empresas")
    op.drop_index("ix_empresas_municipio_id", "empresas")
    op.drop_table("empresas")

    op.drop_index("ix_comex_tipo_op", "comex_mensal")
    op.drop_index("ix_comex_mes", "comex_mensal")
    op.drop_index("ix_comex_ano", "comex_mensal")
    op.drop_index("ix_comex_municipio_id", "comex_mensal")
    op.drop_table("comex_mensal")

    op.drop_index("ix_estban_data_ref", "estban_mensal")
    op.drop_index("ix_estban_municipio_id", "estban_mensal")
    op.drop_table("estban_mensal")

    op.drop_index("ix_inss_categoria", "inss_anual")
    op.drop_index("ix_inss_ano", "inss_anual")
    op.drop_index("ix_inss_municipio_id", "inss_anual")
    op.drop_table("inss_anual")

    op.drop_index("ix_pdm_mes", "pe_de_meia_resumo")
    op.drop_index("ix_pdm_ano", "pe_de_meia_resumo")
    op.drop_index("ix_pdm_municipio_id", "pe_de_meia_resumo")
    op.drop_table("pe_de_meia_resumo")

    op.drop_index("ix_bf_mes", "bolsa_familia_resumo")
    op.drop_index("ix_bf_ano", "bolsa_familia_resumo")
    op.drop_index("ix_bf_municipio_id", "bolsa_familia_resumo")
    op.drop_table("bolsa_familia_resumo")
