"""add populacao_municipio and fpm_mensal tables

População estimada anual (IBGE, agregado 6579) e repasses mensais brutos do
FPM (STN). Bases do Alerta de Faixa do FPM.

Revision ID: 0030_fpm_populacao
Revises: 0029_projeto_imagem_presets
Create Date: 2026-07-06
"""

import sqlalchemy as sa
from alembic import op


revision = "0030_fpm_populacao"
down_revision = "0029_projeto_imagem_presets"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "populacao_municipio",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("populacao", sa.Integer(), nullable=False),
        sa.Column("fonte", sa.String(length=60), nullable=False, server_default="Estimativa IBGE"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", name="uq_populacao_municipio_ano"),
    )
    op.create_index(op.f("ix_populacao_municipio_id"), "populacao_municipio", ["id"], unique=False)
    op.create_index(op.f("ix_populacao_municipio_municipio_id"), "populacao_municipio", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_populacao_municipio_ano"), "populacao_municipio", ["ano"], unique=False)

    op.create_table(
        "fpm_mensal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("valor", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("municipio_id", "ano", "mes", name="uq_fpm_mensal_municipio_ano_mes"),
    )
    op.create_index(op.f("ix_fpm_mensal_id"), "fpm_mensal", ["id"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_municipio_id"), "fpm_mensal", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_ano"), "fpm_mensal", ["ano"], unique=False)
    op.create_index(op.f("ix_fpm_mensal_mes"), "fpm_mensal", ["mes"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_fpm_mensal_mes"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_ano"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_municipio_id"), table_name="fpm_mensal")
    op.drop_index(op.f("ix_fpm_mensal_id"), table_name="fpm_mensal")
    op.drop_table("fpm_mensal")
    op.drop_index(op.f("ix_populacao_municipio_ano"), table_name="populacao_municipio")
    op.drop_index(op.f("ix_populacao_municipio_municipio_id"), table_name="populacao_municipio")
    op.drop_index(op.f("ix_populacao_municipio_id"), table_name="populacao_municipio")
    op.drop_table("populacao_municipio")
