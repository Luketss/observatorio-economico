"""add new RAIS aggregates: motivo_desligamento, tipo_admissao, cbo, tamanho_estab,
natureza_juridica, turnover_mensal; extend rais_metricas_anuais with contract-type counts.

Revision ID: 0021_rais_extra_aggregates
Revises: b002efc404da
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_rais_extra_aggregates"
down_revision = "b002efc404da"
branch_labels = None
depends_on = None


def upgrade():
    # Extend rais_metricas_anuais with contract-type counts and Dec-31 active count.
    with op.batch_alter_table("rais_metricas_anuais") as batch:
        batch.add_column(sa.Column("total_ativo_dezembro", sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("total_parcial",        sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("total_intermitente",   sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("total_simples",        sa.Integer(), server_default="0", nullable=False))
        batch.add_column(sa.Column("total_aprendiz_estimado", sa.Integer(), server_default="0", nullable=False))

    op.create_table(
        "rais_por_motivo_desligamento",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("motivo", sa.String(120), nullable=False),
        sa.Column("total_desligamentos", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        "ix_rais_motivo_unique",
        "rais_por_motivo_desligamento",
        ["municipio_id", "ano", "motivo"],
        unique=True,
    )

    op.create_table(
        "rais_por_tipo_admissao",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("tipo", sa.String(120), nullable=False),
        sa.Column("total_admissoes", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        "ix_rais_tipo_admissao_unique",
        "rais_por_tipo_admissao",
        ["municipio_id", "ano", "tipo"],
        unique=True,
    )

    op.create_table(
        "rais_por_cbo",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("cbo_familia", sa.String(8), nullable=False),
        sa.Column("descricao", sa.String(160), nullable=True),
        sa.Column("total_vinculos", sa.Integer, server_default="0", nullable=False),
        sa.Column("remuneracao_media", sa.Float, nullable=True),
    )
    op.create_index(
        "ix_rais_cbo_unique",
        "rais_por_cbo",
        ["municipio_id", "ano", "cbo_familia"],
        unique=True,
    )

    op.create_table(
        "rais_por_tamanho_estabelecimento",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("tamanho", sa.String(60), nullable=False),
        sa.Column("total_vinculos", sa.Integer, server_default="0", nullable=False),
        sa.Column("remuneracao_media", sa.Float, nullable=True),
    )
    op.create_index(
        "ix_rais_tamanho_unique",
        "rais_por_tamanho_estabelecimento",
        ["municipio_id", "ano", "tamanho"],
        unique=True,
    )

    op.create_table(
        "rais_por_natureza_juridica",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("grupo", sa.String(80), nullable=False),
        sa.Column("total_vinculos", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        "ix_rais_natureza_unique",
        "rais_por_natureza_juridica",
        ["municipio_id", "ano", "grupo"],
        unique=True,
    )

    op.create_table(
        "rais_turnover_mensal",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("mes", sa.Integer, nullable=False, index=True),
        sa.Column("total_admissoes", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_desligamentos", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        "ix_rais_turnover_unique",
        "rais_turnover_mensal",
        ["municipio_id", "ano", "mes"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_rais_turnover_unique", table_name="rais_turnover_mensal")
    op.drop_table("rais_turnover_mensal")

    op.drop_index("ix_rais_natureza_unique", table_name="rais_por_natureza_juridica")
    op.drop_table("rais_por_natureza_juridica")

    op.drop_index("ix_rais_tamanho_unique", table_name="rais_por_tamanho_estabelecimento")
    op.drop_table("rais_por_tamanho_estabelecimento")

    op.drop_index("ix_rais_cbo_unique", table_name="rais_por_cbo")
    op.drop_table("rais_por_cbo")

    op.drop_index("ix_rais_tipo_admissao_unique", table_name="rais_por_tipo_admissao")
    op.drop_table("rais_por_tipo_admissao")

    op.drop_index("ix_rais_motivo_unique", table_name="rais_por_motivo_desligamento")
    op.drop_table("rais_por_motivo_desligamento")

    with op.batch_alter_table("rais_metricas_anuais") as batch:
        batch.drop_column("total_aprendiz_estimado")
        batch.drop_column("total_simples")
        batch.drop_column("total_intermitente")
        batch.drop_column("total_parcial")
        batch.drop_column("total_ativo_dezembro")
