"""plano brasao custom cards

Revision ID: 0007_plano_brasao_custom_cards
Revises: 0006_marcos_mandato
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_plano_brasao_custom_cards"
down_revision = "0006_marcos_mandato"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- municipios: add plano and brasao columns ---
    op.add_column(
        "municipios",
        sa.Column("plano", sa.String(10), nullable=False, server_default="paid"),
    )
    op.add_column(
        "municipios",
        sa.Column("brasao", sa.Text(), nullable=True),
    )

    # --- dashboard_cards_custom table ---
    op.create_table(
        "dashboard_cards_custom",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("municipio_id", sa.Integer(), sa.ForeignKey("municipios.id"), nullable=False, index=True),
        sa.Column("titulo", sa.String(100), nullable=False),
        sa.Column("valor", sa.String(100), nullable=False),
        sa.Column("subtitulo", sa.String(150), nullable=True),
        sa.Column("icone", sa.String(50), nullable=False, server_default="StarIcon"),
        sa.Column("cor", sa.String(20), nullable=False, server_default="blue"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
    )

    # --- plano_config table ---
    op.create_table(
        "plano_config",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("plano", sa.String(10), nullable=False, unique=True),
        sa.Column("modulos", sa.Text(), nullable=False),
    )

    # Seed initial plan configs
    plano_config_table = sa.table(
        "plano_config",
        sa.column("plano", sa.String),
        sa.column("modulos", sa.Text),
    )
    op.bulk_insert(
        plano_config_table,
        [
            {
                "plano": "free",
                "modulos": '["geral","caged","bolsa_familia"]',
            },
            {
                "plano": "paid",
                "modulos": '["geral","arrecadacao","pib","caged","rais","bolsa_familia","pe_de_meia","inss","estban","comex","empresas","insights_ia","timeline_mandato"]',
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("plano_config")
    op.drop_table("dashboard_cards_custom")
    op.drop_column("municipios", "brasao")
    op.drop_column("municipios", "plano")
