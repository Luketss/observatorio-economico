"""0012 rename paid plan to pro and add indicadores_info table

Revision ID: 0012_rename_paid_to_pro_add_premium
Revises: 0011_estban_novos_campos
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_rename_paid_to_pro_add_premium"
down_revision = "0011_estban_novos_campos"
branch_labels = None
depends_on = None


def upgrade():
    # Rename 'paid' plan to 'pro' in all tables
    op.execute("UPDATE plano_config SET plano = 'pro' WHERE plano = 'paid'")
    op.execute("UPDATE municipios SET plano = 'pro' WHERE plano = 'paid'")

    # Create indicadores_info table
    op.create_table(
        "indicadores_info",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dataset", sa.String(length=50), nullable=False),
        sa.Column("indicador_key", sa.String(length=100), nullable=False),
        sa.Column("tooltip", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("descricao", sa.Text(), nullable=False, server_default=""),
        sa.Column("fonte", sa.String(length=200), nullable=True),
        sa.Column(
            "atualizado_em",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset", "indicador_key", name="uq_indicador_dataset_key"),
    )
    op.create_index(op.f("ix_indicadores_info_id"), "indicadores_info", ["id"], unique=False)
    op.create_index(op.f("ix_indicadores_info_dataset"), "indicadores_info", ["dataset"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_indicadores_info_dataset"), table_name="indicadores_info")
    op.drop_index(op.f("ix_indicadores_info_id"), table_name="indicadores_info")
    op.drop_table("indicadores_info")

    op.execute("UPDATE plano_config SET plano = 'paid' WHERE plano = 'pro'")
    op.execute("UPDATE municipios SET plano = 'paid' WHERE plano = 'pro'")
