"""add vaf_anual table

Annual VAF (Valor Adicionado Fiscal) data, the basis for the municipal ICMS
participation index (IPM). One row per (municipio, ano_base). The monetary VAF
columns may arrive zeroed; index/percent columns carry the meaningful values.

Revision ID: 0027_vaf_anual
Revises: 0026_dataset_info_fonte
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from alembic import op


revision = "0027_vaf_anual"
down_revision = "0026_dataset_info_fonte"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vaf_anual",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano_base", sa.Integer(), nullable=False),
        sa.Column("ano_aplicacao", sa.Integer(), nullable=True),
        sa.Column("vaf_individual", sa.Float(), nullable=True),
        sa.Column("pct_vaf_individual", sa.Float(), nullable=True),
        sa.Column("vaf_estado", sa.Float(), nullable=True),
        sa.Column("pct_vaf_estado", sa.Float(), nullable=True),
        sa.Column("indice", sa.Float(), nullable=True),
        sa.Column("pct_indice", sa.Float(), nullable=True),
        sa.Column("indice_medio", sa.Float(), nullable=True),
        sa.Column("pct_indice_medio", sa.Float(), nullable=True),
        sa.Column("indice_participacao_municipal", sa.Float(), nullable=True),
        sa.Column("pct_ipm", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano_base", name="uq_vaf_anual_municipio_ano"),
    )
    op.create_index(op.f("ix_vaf_anual_id"), "vaf_anual", ["id"], unique=False)
    op.create_index(op.f("ix_vaf_anual_municipio_id"), "vaf_anual", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_vaf_anual_ano_base"), "vaf_anual", ["ano_base"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_vaf_anual_ano_base"), table_name="vaf_anual")
    op.drop_index(op.f("ix_vaf_anual_municipio_id"), table_name="vaf_anual")
    op.drop_index(op.f("ix_vaf_anual_id"), table_name="vaf_anual")
    op.drop_table("vaf_anual")
