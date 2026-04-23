"""add projeto_eixos and projetos tables

Revision ID: 0018_projetos
Revises: 0017_rename_caged_admissoes
Create Date: 2026-04-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_projetos"
down_revision = "0017_rename_caged_admissoes"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projeto_eixos",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("ordem", sa.Integer, default=0),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "projetos",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("eixo_id", sa.Integer, sa.ForeignKey("projeto_eixos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("criado_por", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), default="nao_iniciado"),
        sa.Column("data_inicio", sa.Date, nullable=True),
        sa.Column("data_prazo", sa.Date, nullable=True),
        sa.Column("departamento", sa.String(150), nullable=True),
        sa.Column("conteudo", sa.Text, nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("projetos")
    op.drop_table("projeto_eixos")
