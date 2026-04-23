"""add dados_internos tables (indicadores_internos, plano_gov_acoes, eventos_municipio)

Revision ID: 0019_dados_internos
Revises: 0018_projetos
Create Date: 2026-04-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "0019_dados_internos"
down_revision = "0018_projetos"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "indicadores_internos",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("area", sa.String(100), nullable=False, index=True),
        sa.Column("nome_metrica", sa.String(200), nullable=False),
        sa.Column("valor", sa.Float, nullable=False),
        sa.Column("unidade", sa.String(50), nullable=False),
        sa.Column("periodo_tipo", sa.String(10), nullable=False),
        sa.Column("periodo_ano", sa.Integer, nullable=False),
        sa.Column("periodo_mes", sa.Integer, nullable=True),
        sa.Column("fonte", sa.String(300), nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "plano_gov_acoes",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("departamento", sa.String(150), nullable=False, index=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), default="nao_iniciado", index=True),
        sa.Column("data_inicio", sa.Date, nullable=True),
        sa.Column("data_prazo", sa.Date, nullable=True),
        sa.Column("responsavel", sa.String(150), nullable=True),
        sa.Column("departamentos_envolvidos", JSON, nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "eventos_municipio",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer, sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("criado_por", sa.Integer, sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("data_inicio", sa.Date, nullable=False, index=True),
        sa.Column("data_fim", sa.Date, nullable=True),
        sa.Column("horario_inicio", sa.Time, nullable=True),
        sa.Column("horario_fim", sa.Time, nullable=True),
        sa.Column("local", sa.String(200), nullable=True),
        sa.Column("tipo", sa.String(20), nullable=False, default="outro"),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("eventos_municipio")
    op.drop_table("plano_gov_acoes")
    op.drop_table("indicadores_internos")
