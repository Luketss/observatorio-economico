"""add insights_ia table

Revision ID: 0005_caged_rais_detail_insights
Revises: 0005_caged_rais_detail
Create Date: 2026-03-31
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_caged_rais_detail_insights"
down_revision = "0005_caged_rais_detail"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "insights_ia",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("dataset", sa.String(50), nullable=False),
        sa.Column("periodo", sa.String(20), nullable=False),
        sa.Column("conteudo", sa.Text, nullable=False),
        sa.Column("modelo", sa.String(50), nullable=False),
        sa.Column("gerado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("municipio_id", "dataset", "periodo", name="uq_insight_municipio_dataset_periodo"),
    )


def downgrade():
    op.drop_table("insights_ia")
