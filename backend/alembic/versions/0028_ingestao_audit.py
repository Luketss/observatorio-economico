"""add ingestao_audit table

Trail of data-load operations triggered through the admin UI (re-ingestion via
CSV upload, per-dataset wipe, full-ingestion wipe).

Revision ID: 0028_ingestao_audit
Revises: 0027_vaf_anual
Create Date: 2026-06-21
"""

import sqlalchemy as sa
from alembic import op


revision = "0028_ingestao_audit"
down_revision = "0027_vaf_anual"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ingestao_audit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("dataset", sa.String(length=50), nullable=True),
        sa.Column("acao", sa.String(length=30), nullable=False),
        sa.Column("num_linhas", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ok"),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestao_audit_id"), "ingestao_audit", ["id"], unique=False)
    op.create_index(op.f("ix_ingestao_audit_municipio_id"), "ingestao_audit", ["municipio_id"], unique=False)
    op.create_index(op.f("ix_ingestao_audit_usuario_id"), "ingestao_audit", ["usuario_id"], unique=False)
    op.create_index(op.f("ix_ingestao_audit_dataset"), "ingestao_audit", ["dataset"], unique=False)
    op.create_index(op.f("ix_ingestao_audit_criado_em"), "ingestao_audit", ["criado_em"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_ingestao_audit_criado_em"), table_name="ingestao_audit")
    op.drop_index(op.f("ix_ingestao_audit_dataset"), table_name="ingestao_audit")
    op.drop_index(op.f("ix_ingestao_audit_usuario_id"), table_name="ingestao_audit")
    op.drop_index(op.f("ix_ingestao_audit_municipio_id"), table_name="ingestao_audit")
    op.drop_index(op.f("ix_ingestao_audit_id"), table_name="ingestao_audit")
    op.drop_table("ingestao_audit")
