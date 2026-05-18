"""add is_demo column to municipios so demos can be excluded from cross-município
analytics (benchmark, ranking, comparativo) while staying visible in admin
management surfaces.

Revision ID: 0023_add_is_demo_to_municipios
Revises: 0022_caged_extra_aggregates
Create Date: 2026-05-17
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_add_is_demo_to_municipios"
down_revision = "0022_caged_extra_aggregates"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "municipios",
        sa.Column(
            "is_demo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index("ix_municipios_is_demo", "municipios", ["is_demo"])


def downgrade():
    op.drop_index("ix_municipios_is_demo", table_name="municipios")
    op.drop_column("municipios", "is_demo")
