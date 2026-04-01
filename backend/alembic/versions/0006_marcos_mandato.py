"""add marcos_mandato table

Revision ID: 0006_marcos_mandato
Revises: 0005_caged_rais_detail_insights
Create Date: 2026-03-31
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_marcos_mandato"
down_revision = "0005_caged_rais_detail_insights"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "marcos_mandato",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("data", sa.Date, nullable=False, index=True),
        sa.Column("titulo", sa.String(100), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False, server_default="evento"),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_table("marcos_mandato")
