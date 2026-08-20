"""marco: campo link (url opcional)

Revision ID: 0039_marco_link
Revises: 0038_gestao_empresarial
Create Date: 2026-08-20

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0039_marco_link'
down_revision = '0038_gestao_empresarial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('marcos_mandato', sa.Column('link', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('marcos_mandato', 'link')
