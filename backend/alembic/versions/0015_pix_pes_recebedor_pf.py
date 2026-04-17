"""add qt_pes_recebedor_pf to pix_mensal

Revision ID: 0015_pix_pes_recebedor_pf
Revises: 0014_drop_caged_setor
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_pix_pes_recebedor_pf"
down_revision = "0014_drop_caged_setor"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "pix_mensal",
        sa.Column("qt_pes_recebedor_pf", sa.BigInteger(), nullable=True),
    )


def downgrade():
    op.drop_column("pix_mensal", "qt_pes_recebedor_pf")
