"""rename caged_movimentacao admissoes column (remove accent)

Revision ID: 0017_rename_caged_admissoes
Revises: 0016_drop_rais_setor
Create Date: 2026-04-17
"""

from alembic import op

revision = "0017_rename_caged_admissoes"
down_revision = "0016_drop_rais_setor"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("caged_movimentacao", "admissões", new_column_name="admissoes")


def downgrade():
    op.alter_column("caged_movimentacao", "admissoes", new_column_name="admissões")
