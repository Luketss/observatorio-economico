"""dataset info table

Revision ID: 0009_dataset_info
Revises: 0008_insight_visibilidade
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_dataset_info"
down_revision = "0008_insight_visibilidade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_info",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("dataset", sa.String(50), nullable=False, unique=True),
        sa.Column("titulo", sa.String(150), nullable=False, server_default=""),
        sa.Column("conteudo", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "atualizado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("dataset_info")
