"""add caged_movimentacao and rais_vinculos tables

Revision ID: 0002_caged_rais
Revises: 0001_initial
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_caged_rais"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "caged_movimentacao",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("admissões", sa.Integer(), nullable=False),
        sa.Column("desligamentos", sa.Integer(), nullable=False),
        sa.Column("saldo", sa.Integer(), nullable=False),
        sa.Column("setor", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_caged_municipio_id", "caged_movimentacao", ["municipio_id"])
    op.create_index("ix_caged_ano", "caged_movimentacao", ["ano"])
    op.create_index("ix_caged_mes", "caged_movimentacao", ["mes"])

    op.create_table(
        "rais_vinculos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False),
        sa.Column("setor", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_rais_municipio_id", "rais_vinculos", ["municipio_id"])
    op.create_index("ix_rais_ano", "rais_vinculos", ["ano"])


def downgrade() -> None:
    op.drop_index("ix_rais_ano", "rais_vinculos")
    op.drop_index("ix_rais_municipio_id", "rais_vinculos")
    op.drop_table("rais_vinculos")

    op.drop_index("ix_caged_mes", "caged_movimentacao")
    op.drop_index("ix_caged_ano", "caged_movimentacao")
    op.drop_index("ix_caged_municipio_id", "caged_movimentacao")
    op.drop_table("caged_movimentacao")
