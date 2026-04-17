"""drop rais_vinculos setor column (always NULL)

Revision ID: 0016_drop_rais_setor
Revises: 0015_pix_pes_recebedor_pf
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_drop_rais_setor"
down_revision = "0015_pix_pes_recebedor_pf"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("rais_vinculos", "setor")


def downgrade():
    op.add_column(
        "rais_vinculos",
        sa.Column("setor", sa.String(100), nullable=True),
    )
