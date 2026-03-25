"""add detail tables: pe_de_meia_etapa, estban_por_instituicao, comex_por_produto, comex_por_pais; add bolsa_familia_resumo columns

Revision ID: 0004_detail_tables
Revises: 0003_new_datasets
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_detail_tables"
down_revision = "0003_new_datasets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================
    # BOLSA FAMILIA - new nullable columns
    # =========================
    op.add_column(
        "bolsa_familia_resumo",
        sa.Column("valor_primeira_infancia", sa.Float(), nullable=True),
    )
    op.add_column(
        "bolsa_familia_resumo",
        sa.Column("beneficiarios_primeira_infancia", sa.Integer(), nullable=True),
    )

    # =========================
    # PE DE MEIA ETAPA
    # =========================
    op.create_table(
        "pe_de_meia_etapa",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("etapa_ensino", sa.String(length=150), nullable=False),
        sa.Column("tipo_incentivo", sa.String(length=100), nullable=False),
        sa.Column("total_estudantes", sa.Integer(), nullable=False),
        sa.Column("valor_total", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_pdme_municipio_id", "pe_de_meia_etapa", ["municipio_id"])
    op.create_index("ix_pdme_ano", "pe_de_meia_etapa", ["ano"])
    op.create_index("ix_pdme_mes", "pe_de_meia_etapa", ["mes"])
    op.create_index("ix_pdme_etapa_ensino", "pe_de_meia_etapa", ["etapa_ensino"])
    op.create_index("ix_pdme_tipo_incentivo", "pe_de_meia_etapa", ["tipo_incentivo"])

    # =========================
    # ESTBAN POR INSTITUICAO
    # =========================
    op.create_table(
        "estban_por_instituicao",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("data_referencia", sa.Date(), nullable=False),
        sa.Column("nome_instituicao", sa.String(length=150), nullable=False),
        sa.Column("qtd_agencias", sa.Integer(), nullable=False),
        sa.Column("valor_operacoes_credito", sa.Float(), nullable=False),
        sa.Column("valor_depositos_vista", sa.Float(), nullable=False),
        sa.Column("valor_poupanca", sa.Float(), nullable=False),
        sa.Column("valor_depositos_prazo", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_estban_inst_municipio_id", "estban_por_instituicao", ["municipio_id"])
    op.create_index("ix_estban_inst_data_ref", "estban_por_instituicao", ["data_referencia"])
    op.create_index("ix_estban_inst_nome", "estban_por_instituicao", ["nome_instituicao"])

    # =========================
    # COMEX POR PRODUTO
    # =========================
    op.create_table(
        "comex_por_produto",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("tipo_operacao", sa.String(length=10), nullable=False),
        sa.Column("produto", sa.String(length=300), nullable=False),
        sa.Column("valor_usd", sa.Float(), nullable=False),
        sa.Column("peso_kg", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_comex_prod_municipio_id", "comex_por_produto", ["municipio_id"])
    op.create_index("ix_comex_prod_ano", "comex_por_produto", ["ano"])
    op.create_index("ix_comex_prod_tipo_op", "comex_por_produto", ["tipo_operacao"])

    # =========================
    # COMEX POR PAIS
    # =========================
    op.create_table(
        "comex_por_pais",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("tipo_operacao", sa.String(length=10), nullable=False),
        sa.Column("pais", sa.String(length=150), nullable=False),
        sa.Column("valor_usd", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_comex_pais_municipio_id", "comex_por_pais", ["municipio_id"])
    op.create_index("ix_comex_pais_ano", "comex_por_pais", ["ano"])
    op.create_index("ix_comex_pais_tipo_op", "comex_por_pais", ["tipo_operacao"])


def downgrade() -> None:
    op.drop_index("ix_comex_pais_tipo_op", "comex_por_pais")
    op.drop_index("ix_comex_pais_ano", "comex_por_pais")
    op.drop_index("ix_comex_pais_municipio_id", "comex_por_pais")
    op.drop_table("comex_por_pais")

    op.drop_index("ix_comex_prod_tipo_op", "comex_por_produto")
    op.drop_index("ix_comex_prod_ano", "comex_por_produto")
    op.drop_index("ix_comex_prod_municipio_id", "comex_por_produto")
    op.drop_table("comex_por_produto")

    op.drop_index("ix_estban_inst_nome", "estban_por_instituicao")
    op.drop_index("ix_estban_inst_data_ref", "estban_por_instituicao")
    op.drop_index("ix_estban_inst_municipio_id", "estban_por_instituicao")
    op.drop_table("estban_por_instituicao")

    op.drop_index("ix_pdme_tipo_incentivo", "pe_de_meia_etapa")
    op.drop_index("ix_pdme_etapa_ensino", "pe_de_meia_etapa")
    op.drop_index("ix_pdme_mes", "pe_de_meia_etapa")
    op.drop_index("ix_pdme_ano", "pe_de_meia_etapa")
    op.drop_index("ix_pdme_municipio_id", "pe_de_meia_etapa")
    op.drop_table("pe_de_meia_etapa")

    op.drop_column("bolsa_familia_resumo", "beneficiarios_primeira_infancia")
    op.drop_column("bolsa_familia_resumo", "valor_primeira_infancia")
