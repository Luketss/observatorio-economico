"""drop caged setor column (always NULL)

Revision ID: 0014_drop_caged_setor
Revises: 0013_notificacoes
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_drop_caged_setor"
down_revision = "0013_notificacoes"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("caged_movimentacao", "setor")


def downgrade():
    op.add_column(
        "caged_movimentacao",
        sa.Column("setor", sa.String(100), nullable=True),
    )
