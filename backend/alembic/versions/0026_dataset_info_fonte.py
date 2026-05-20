"""add fonte + data_atualizacao to dataset_info

Per-dataset ingestion metadata: the data source ("fonte") and a free-text
reference/update date ("data_atualizacao", e.g. "Março/2026", "Ano-base 2024").
Both nullable — ADMIN_GLOBAL fills them in via the Fontes de Dados admin page.
Distinct from atualizado_em, which stays an internal audit timestamp.

Revision ID: 0026_dataset_info_fonte
Revises: 0025_login_audit
Create Date: 2026-05-20
"""

import sqlalchemy as sa
from alembic import op


revision = "0026_dataset_info_fonte"
down_revision = "0025_login_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "dataset_info",
        sa.Column("fonte", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "dataset_info",
        sa.Column("data_atualizacao", sa.String(length=60), nullable=True),
    )


def downgrade():
    op.drop_column("dataset_info", "data_atualizacao")
    op.drop_column("dataset_info", "fonte")
