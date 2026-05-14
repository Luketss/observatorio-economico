"""add new CAGED aggregates: tipo_deficiencia, tamanho_estabelecimento,
tipo_empregador, tipo_estabelecimento, plus annual contract-quality indicators.

Revision ID: 0022_caged_extra_aggregates
Revises: 0021_rais_extra_aggregates
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_caged_extra_aggregates"
down_revision = "0021_rais_extra_aggregates"
branch_labels = None
depends_on = None


def _create_monthly(table_name: str, dim_col: str, dim_len: int):
    op.create_table(
        table_name,
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("mes", sa.Integer, nullable=False, index=True),
        sa.Column(dim_col, sa.String(dim_len), nullable=False),
        sa.Column("admissoes", sa.Integer, server_default="0", nullable=False),
        sa.Column("desligamentos", sa.Integer, server_default="0", nullable=False),
        sa.Column("saldo", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        f"ix_{table_name}_unique",
        table_name,
        ["municipio_id", "ano", "mes", dim_col],
        unique=True,
    )


def upgrade():
    _create_monthly("caged_por_tipo_deficiencia", "tipo_deficiencia", 60)
    _create_monthly("caged_por_tamanho_estabelecimento", "tamanho", 60)
    _create_monthly("caged_por_tipo_empregador", "tipo_empregador", 80)
    _create_monthly("caged_por_tipo_estabelecimento", "tipo_estabelecimento", 80)

    op.create_table(
        "caged_indicadores_contrato",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("ano", sa.Integer, nullable=False, index=True),
        sa.Column("total_movimentacoes", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_parcial", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_intermitente", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_aprendiz", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_pcd", sa.Integer, server_default="0", nullable=False),
        sa.Column("total_fora_prazo", sa.Integer, server_default="0", nullable=False),
    )
    op.create_index(
        "ix_caged_indicadores_unique",
        "caged_indicadores_contrato",
        ["municipio_id", "ano"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_caged_indicadores_unique", table_name="caged_indicadores_contrato")
    op.drop_table("caged_indicadores_contrato")

    for t in [
        "caged_por_tipo_estabelecimento",
        "caged_por_tipo_empregador",
        "caged_por_tamanho_estabelecimento",
        "caged_por_tipo_deficiencia",
    ]:
        op.drop_index(f"ix_{t}_unique", table_name=t)
        op.drop_table(t)
