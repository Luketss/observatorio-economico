"""add projeto_imagem_presets gallery + eixo imagem_id

Global cover-image gallery (managed by ADMIN_GLOBAL, base64) that each project
eixo can pick a cover from.

Revision ID: 0029_projeto_imagem_presets
Revises: 0028_ingestao_audit
Create Date: 2026-06-25
"""

import sqlalchemy as sa
from alembic import op


revision = "0029_projeto_imagem_presets"
down_revision = "0028_ingestao_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "projeto_imagem_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=100), nullable=True),
        sa.Column("imagem", sa.Text(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projeto_imagem_presets_id"), "projeto_imagem_presets", ["id"], unique=False)
    op.add_column(
        "projeto_eixos",
        sa.Column("imagem_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_projeto_eixos_imagem_id",
        "projeto_eixos",
        "projeto_imagem_presets",
        ["imagem_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_projeto_eixos_imagem_id", "projeto_eixos", type_="foreignkey")
    op.drop_column("projeto_eixos", "imagem_id")
    op.drop_index(op.f("ix_projeto_imagem_presets_id"), table_name="projeto_imagem_presets")
    op.drop_table("projeto_imagem_presets")
