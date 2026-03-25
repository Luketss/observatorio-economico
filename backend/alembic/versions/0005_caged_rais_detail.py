"""add CAGED and RAIS detail tables (sexo, raca, salario, cnae); add rais_vinculos.remuneracao_media

Revision ID: 0005_caged_rais_detail
Revises: 0004_detail_tables
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_caged_rais_detail"
down_revision = "0004_detail_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================
    # RAIS VINCULOS — add remuneracao_media column
    # =========================
    op.add_column(
        "rais_vinculos",
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
    )

    # =========================
    # CAGED POR SEXO
    # =========================
    op.create_table(
        "caged_por_sexo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("sexo", sa.String(length=30), nullable=False),
        sa.Column("admissoes", sa.Integer(), nullable=False),
        sa.Column("desligamentos", sa.Integer(), nullable=False),
        sa.Column("saldo", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_caged_sexo_municipio_id", "caged_por_sexo", ["municipio_id"])
    op.create_index("ix_caged_sexo_ano", "caged_por_sexo", ["ano"])
    op.create_index("ix_caged_sexo_mes", "caged_por_sexo", ["mes"])

    # =========================
    # CAGED POR RACA
    # =========================
    op.create_table(
        "caged_por_raca",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("raca_cor", sa.String(length=50), nullable=False),
        sa.Column("admissoes", sa.Integer(), nullable=False),
        sa.Column("desligamentos", sa.Integer(), nullable=False),
        sa.Column("saldo", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_caged_raca_municipio_id", "caged_por_raca", ["municipio_id"])
    op.create_index("ix_caged_raca_ano", "caged_por_raca", ["ano"])
    op.create_index("ix_caged_raca_mes", "caged_por_raca", ["mes"])

    # =========================
    # CAGED SALARIO
    # =========================
    op.create_table(
        "caged_salario",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("salario_medio_admissoes", sa.Float(), nullable=True),
        sa.Column("salario_medio_desligamentos", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_caged_salario_municipio_id", "caged_salario", ["municipio_id"])
    op.create_index("ix_caged_salario_ano", "caged_salario", ["ano"])
    op.create_index("ix_caged_salario_mes", "caged_salario", ["mes"])

    # =========================
    # CAGED POR CNAE
    # =========================
    op.create_table(
        "caged_por_cnae",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("secao", sa.String(length=5), nullable=False),
        sa.Column("descricao_secao", sa.String(length=150), nullable=False),
        sa.Column("admissoes", sa.Integer(), nullable=False),
        sa.Column("desligamentos", sa.Integer(), nullable=False),
        sa.Column("saldo", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_caged_cnae_municipio_id", "caged_por_cnae", ["municipio_id"])
    op.create_index("ix_caged_cnae_ano", "caged_por_cnae", ["ano"])
    op.create_index("ix_caged_cnae_mes", "caged_por_cnae", ["mes"])

    # =========================
    # RAIS POR SEXO
    # =========================
    op.create_table(
        "rais_por_sexo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("sexo", sa.String(length=30), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False),
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_rais_sexo_municipio_id", "rais_por_sexo", ["municipio_id"])
    op.create_index("ix_rais_sexo_ano", "rais_por_sexo", ["ano"])

    # =========================
    # RAIS POR RACA
    # =========================
    op.create_table(
        "rais_por_raca",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("raca_cor", sa.String(length=50), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False),
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_rais_raca_municipio_id", "rais_por_raca", ["municipio_id"])
    op.create_index("ix_rais_raca_ano", "rais_por_raca", ["ano"])

    # =========================
    # RAIS POR CNAE
    # =========================
    op.create_table(
        "rais_por_cnae",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("secao", sa.String(length=5), nullable=False),
        sa.Column("descricao_secao", sa.String(length=150), nullable=False),
        sa.Column("total_vinculos", sa.Integer(), nullable=False),
        sa.Column("remuneracao_media", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )
    op.create_index("ix_rais_cnae_municipio_id", "rais_por_cnae", ["municipio_id"])
    op.create_index("ix_rais_cnae_ano", "rais_por_cnae", ["ano"])


def downgrade() -> None:
    op.drop_index("ix_rais_cnae_ano", "rais_por_cnae")
    op.drop_index("ix_rais_cnae_municipio_id", "rais_por_cnae")
    op.drop_table("rais_por_cnae")

    op.drop_index("ix_rais_raca_ano", "rais_por_raca")
    op.drop_index("ix_rais_raca_municipio_id", "rais_por_raca")
    op.drop_table("rais_por_raca")

    op.drop_index("ix_rais_sexo_ano", "rais_por_sexo")
    op.drop_index("ix_rais_sexo_municipio_id", "rais_por_sexo")
    op.drop_table("rais_por_sexo")

    op.drop_index("ix_caged_cnae_mes", "caged_por_cnae")
    op.drop_index("ix_caged_cnae_ano", "caged_por_cnae")
    op.drop_index("ix_caged_cnae_municipio_id", "caged_por_cnae")
    op.drop_table("caged_por_cnae")

    op.drop_index("ix_caged_salario_mes", "caged_salario")
    op.drop_index("ix_caged_salario_ano", "caged_salario")
    op.drop_index("ix_caged_salario_municipio_id", "caged_salario")
    op.drop_table("caged_salario")

    op.drop_index("ix_caged_raca_mes", "caged_por_raca")
    op.drop_index("ix_caged_raca_ano", "caged_por_raca")
    op.drop_index("ix_caged_raca_municipio_id", "caged_por_raca")
    op.drop_table("caged_por_raca")

    op.drop_index("ix_caged_sexo_mes", "caged_por_sexo")
    op.drop_index("ix_caged_sexo_ano", "caged_por_sexo")
    op.drop_index("ix_caged_sexo_municipio_id", "caged_por_sexo")
    op.drop_table("caged_por_sexo")

    op.drop_column("rais_vinculos", "remuneracao_media")
