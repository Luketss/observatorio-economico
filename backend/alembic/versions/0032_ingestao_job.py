"""add ingestao_job table

Jobs de execução em background das fontes automáticas: status, filtros,
progresso (heartbeat em atualizado_em), resumo e erro. Base do polling da
página /admin/fontes.

Revision ID: 0032_ingestao_job
Revises: 0031_captacao_emendas
Create Date: 2026-07-09
"""

import sqlalchemy as sa
from alembic import op


revision = "0032_ingestao_job"
down_revision = "0031_captacao_emendas"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestao_job",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pendente"),
        sa.Column("filtros", sa.JSON(), nullable=True),
        sa.Column("progresso_atual", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progresso_total", sa.Integer(), nullable=True),
        sa.Column("etapa", sa.String(length=100), nullable=True),
        sa.Column("resumo", sa.JSON(), nullable=True),
        sa.Column("erro", sa.Text(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("iniciado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestao_job_id"), "ingestao_job", ["id"], unique=False)
    op.create_index(op.f("ix_ingestao_job_dataset"), "ingestao_job", ["dataset"], unique=False)
    op.create_index(op.f("ix_ingestao_job_status"), "ingestao_job", ["status"], unique=False)
    op.create_index(op.f("ix_ingestao_job_usuario_id"), "ingestao_job", ["usuario_id"], unique=False)
    op.create_index(op.f("ix_ingestao_job_criado_em"), "ingestao_job", ["criado_em"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ingestao_job_criado_em"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_usuario_id"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_status"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_dataset"), table_name="ingestao_job")
    op.drop_index(op.f("ix_ingestao_job_id"), table_name="ingestao_job")
    op.drop_table("ingestao_job")
