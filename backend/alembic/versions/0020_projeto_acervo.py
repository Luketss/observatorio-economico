"""add projeto_templates table and acervo columns to projetos

Revision ID: 0020_projeto_acervo
Revises: 0019_dados_internos
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_projeto_acervo"
down_revision = "0019_dados_internos"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projeto_templates",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("eixo_id", sa.Integer, sa.ForeignKey("projeto_eixos.id"), nullable=True, index=True),
        sa.Column("criado_por", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("conteudo", sa.Text, nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column("projetos", sa.Column("template_id", sa.Integer, sa.ForeignKey("projeto_templates.id"), nullable=True))
    op.add_column("projetos", sa.Column("responsavel", sa.String(150), nullable=True))


def downgrade():
    op.drop_column("projetos", "responsavel")
    op.drop_column("projetos", "template_id")
    op.drop_table("projeto_templates")
