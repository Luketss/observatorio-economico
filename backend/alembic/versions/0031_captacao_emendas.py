"""add captacao_federal_anual and emenda_parlamentar tables

Captação federal agregada por município/ano (SICONV) e emendas parlamentares
por município (Portal da Transparência). Bases do Dinheiro na Mesa e do Radar
de Emendas.

Revision ID: 0031_captacao_emendas
Revises: 0030_fpm_populacao
Create Date: 2026-07-07
"""

import sqlalchemy as sa
from alembic import op


revision = "0031_captacao_emendas"
down_revision = "0030_fpm_populacao"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "captacao_federal_anual",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("valor_firmado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_desembolsado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_via_emenda", sa.Float(), nullable=False, server_default="0"),
        sa.Column("qtd_convenios", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", name="uq_captacao_federal_municipio_ano"),
    )
    op.create_index(op.f("ix_captacao_federal_anual_id"), "captacao_federal_anual", ["id"], unique=False)
    op.create_index(op.f("ix_captacao_federal_anual_municipio_id"), "captacao_federal_anual", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_captacao_federal_anual_ano"), "captacao_federal_anual", ["ano"], unique=False)

    op.create_table(
        "emenda_parlamentar",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("codigo_emenda", sa.String(length=60), nullable=False),
        sa.Column("numero_emenda", sa.String(length=20), nullable=True),
        sa.Column("autor", sa.String(length=120), nullable=False),
        sa.Column("tipo_emenda", sa.String(length=120), nullable=False),
        sa.Column("funcao", sa.String(length=80), nullable=True),
        sa.Column("valor_empenhado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_liquidado", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_pago", sa.Float(), nullable=False, server_default="0"),
        sa.Column("valor_resto_pago", sa.Float(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "codigo_emenda", name="uq_emenda_municipio_codigo"),
    )
    op.create_index(op.f("ix_emenda_parlamentar_id"), "emenda_parlamentar", ["id"], unique=False)
    op.create_index(op.f("ix_emenda_parlamentar_municipio_id"), "emenda_parlamentar", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_emenda_parlamentar_ano"), "emenda_parlamentar", ["ano"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_emenda_parlamentar_ano"), table_name="emenda_parlamentar")
    op.drop_index(op.f("ix_emenda_parlamentar_municipio_id"), table_name="emenda_parlamentar")
    op.drop_index(op.f("ix_emenda_parlamentar_id"), table_name="emenda_parlamentar")
    op.drop_table("emenda_parlamentar")
    op.drop_index(op.f("ix_captacao_federal_anual_ano"), table_name="captacao_federal_anual")
    op.drop_index(op.f("ix_captacao_federal_anual_municipio_id"), table_name="captacao_federal_anual")
    op.drop_index(op.f("ix_captacao_federal_anual_id"), table_name="captacao_federal_anual")
    op.drop_table("captacao_federal_anual")
