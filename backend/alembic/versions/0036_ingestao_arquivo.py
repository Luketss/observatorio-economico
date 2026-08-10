"""add ingestao_arquivo table

Blob de upload das fontes com requer_arquivo (IPS): API e worker não
compartilham filesystem, então o arquivo enviado pela tela de coletas
trafega pelo banco até o worker.

Revision ID: 0036_ingestao_arquivo
Revises: 0035_prioridades_permissao
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op


revision = "0036_ingestao_arquivo"
down_revision = "0035_prioridades_permissao"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestao_arquivo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column("conteudo", sa.LargeBinary(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestao_arquivo_id"), "ingestao_arquivo", ["id"], unique=False)
    op.create_index(op.f("ix_ingestao_arquivo_criado_em"), "ingestao_arquivo", ["criado_em"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ingestao_arquivo_criado_em"), table_name="ingestao_arquivo")
    op.drop_index(op.f("ix_ingestao_arquivo_id"), table_name="ingestao_arquivo")
    op.drop_table("ingestao_arquivo")
