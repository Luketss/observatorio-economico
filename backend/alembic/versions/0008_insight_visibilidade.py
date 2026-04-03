"""insight visibilidade

Revision ID: 0008_insight_visibilidade
Revises: 0007_plano_brasao_custom_cards
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_insight_visibilidade"
down_revision = "0007_plano_brasao_custom_cards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "insights_ia",
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "insights_ia",
        sa.Column("oculto_planos", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("insights_ia", "oculto_planos")
    op.drop_column("insights_ia", "ativo")
