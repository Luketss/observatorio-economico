"""0011 estban new credit breakdown columns

Revision ID: 0011_estban_novos_campos
Revises: 0010_rais_extra_pix
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_estban_novos_campos"
down_revision = "0010_rais_extra_pix"
branch_labels = None
depends_on = None

NEW_COLS = [
    "emprestimos_titulos_descontados",
    "financiamentos_gerais",
    "financiamento_agropecuario",
    "financiamentos_imobiliarios",
    "arrendamento_mercantil",
    "emprestimos_setor_publico",
    "outros_creditos",
]


def upgrade() -> None:
    for table in ("estban_mensal", "estban_por_instituicao"):
        for col in NEW_COLS:
            op.add_column(table, sa.Column(col, sa.Float(), nullable=True))


def downgrade() -> None:
    for table in ("estban_mensal", "estban_por_instituicao"):
        for col in NEW_COLS:
            op.drop_column(table, col)
