"""0010 rais extra tables and pix mensal

Revision ID: 0010_rais_extra_pix
Revises: 0009_dataset_info
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_rais_extra_pix"
down_revision = "0009_dataset_info"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rais_por_faixa_etaria",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("faixa_etaria", sa.String(50), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False, default=0),
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
    )

    op.create_table(
        "rais_por_escolaridade",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("grau_instrucao", sa.String(80), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False, default=0),
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
    )

    op.create_table(
        "rais_por_faixa_remuneracao",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("faixa_remuneracao_sm", sa.String(50), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False, default=0),
    )

    op.create_table(
        "rais_por_faixa_tempo_emprego",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("faixa_tempo_emprego", sa.String(50), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False, default=0),
    )

    op.create_table(
        "rais_metricas_anuais",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("total_vinculos", sa.Integer(), nullable=False, default=0),
        sa.Column("total_pcd", sa.Integer(), nullable=False, default=0),
        sa.Column("total_outro_municipio", sa.Integer(), nullable=False, default=0),
        sa.Column("media_dias_afastamento", sa.Float(), nullable=True),
    )

    op.create_table(
        "pix_mensal",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer(), index=True),
        sa.Column("mes", sa.Integer(), index=True),
        sa.Column("vl_pagador_pf", sa.Float(), nullable=True),
        sa.Column("qt_pagador_pf", sa.BigInteger(), nullable=True),
        sa.Column("qt_pes_pagador_pf", sa.BigInteger(), nullable=True),
        sa.Column("vl_pagador_pj", sa.Float(), nullable=True),
        sa.Column("qt_pagador_pj", sa.BigInteger(), nullable=True),
        sa.Column("qt_pes_pagador_pj", sa.BigInteger(), nullable=True),
        sa.Column("vl_recebedor_pf", sa.Float(), nullable=True),
        sa.Column("qt_recebedor_pf", sa.BigInteger(), nullable=True),
        sa.Column("vl_recebedor_pj", sa.Float(), nullable=True),
        sa.Column("qt_recebedor_pj", sa.BigInteger(), nullable=True),
        sa.Column("qt_pes_recebedor_pj", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("pix_mensal")
    op.drop_table("rais_metricas_anuais")
    op.drop_table("rais_por_faixa_tempo_emprego")
    op.drop_table("rais_por_faixa_remuneracao")
    op.drop_table("rais_por_escolaridade")
    op.drop_table("rais_por_faixa_etaria")
