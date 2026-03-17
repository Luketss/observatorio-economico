"""initial schema and insert default roles

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-14
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================
    # TABELA MUNICIPIOS
    # =========================
    op.create_table(
        "municipios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
        sa.Column("estado", sa.String(length=2), nullable=False),
        sa.Column("codigo_ibge", sa.String(length=10), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
    )

    # =========================
    # TABELA ROLES
    # =========================
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=50), nullable=False, unique=True),
        sa.Column("descricao", sa.String(length=255), nullable=True),
    )

    # =========================
    # TABELA USUARIOS
    # =========================
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nome", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False, unique=True),
        sa.Column("senha_hash", sa.String(length=255), nullable=False),
        sa.Column("municipio_id", sa.Integer(), nullable=True),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
    )

    # =========================
    # TABELA ARRECADACAO
    # =========================
    op.create_table(
        "arrecadacao_mensal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("nome_mes", sa.String(length=20)),
        sa.Column("data_base", sa.Date()),
        sa.Column("valor_icms", sa.Float()),
        sa.Column("valor_ipva", sa.Float()),
        sa.Column("valor_ipi", sa.Float()),
        sa.Column("valor_total", sa.Float()),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )

    # =========================
    # TABELA PIB
    # =========================
    op.create_table(
        "pib_anual",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("municipio_id", sa.Integer(), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("tipo_dado", sa.String(length=20)),
        sa.Column("pib_total", sa.Float()),
        sa.Column("va_agropecuaria", sa.Float()),
        sa.Column("va_governo", sa.Float()),
        sa.Column("va_industria", sa.Float()),
        sa.Column("va_servicos", sa.Float()),
        sa.ForeignKeyConstraint(["municipio_id"], ["municipios.id"]),
    )

    # =========================
    # INSERT ROLES PADRÃO
    # =========================
    op.bulk_insert(
        sa.table(
            "roles",
            sa.column("nome", sa.String),
            sa.column("descricao", sa.String),
        ),
        [
            {"nome": "ADMIN_GLOBAL", "descricao": "Administrador Global"},
            {"nome": "ADMIN_MUNICIPIO", "descricao": "Administrador Municipal"},
            {"nome": "ANALISTA", "descricao": "Analista"},
            {"nome": "VISUALIZADOR", "descricao": "Visualizador"},
        ],
    )

    # =========================
    # INSERT MUNICIPIO PADRÃO
    # =========================
    op.bulk_insert(
        sa.table(
            "municipios",
            sa.column("nome", sa.String),
            sa.column("estado", sa.String),
            sa.column("codigo_ibge", sa.String),
            sa.column("ativo", sa.Boolean),
        ),
        [
            {
                "nome": "Município Padrão",
                "estado": "MG",
                "codigo_ibge": "0000000",
                "ativo": True,
            }
        ],
    )

    # =========================
    # INSERT USUÁRIOS PADRÃO
    # Senha padrão: admin123
    # =========================
    op.bulk_insert(
        sa.table(
            "usuarios",
            sa.column("nome", sa.String),
            sa.column("email", sa.String),
            sa.column("senha_hash", sa.String),
            sa.column("municipio_id", sa.Integer),
            sa.column("role_id", sa.Integer),
            sa.column("ativo", sa.Boolean),
        ),
        [
            {
                "nome": "Administrador Global",
                "email": "admin@observatorio.com",
                "senha_hash": "$2b$12$KIXQ4QfQe7YQDdyCjTiMQuYzfoalGexiLRNvKcJsteVEh9UpAJZci",
                "municipio_id": None,
                "role_id": 1,
                "ativo": True,
            },
            {
                "nome": "Administrador Municipal",
                "email": "admin.municipio@observatorio.com",
                "senha_hash": "$2b$12$KIXQ4QfQe7YQDdyCjTiMQuYzfoalGexiLRNvKcJsteVEh9UpAJZci",
                "municipio_id": 1,
                "role_id": 2,
                "ativo": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("pib_anual")
    op.drop_table("arrecadacao_mensal")
    op.drop_table("usuarios")
    op.drop_table("roles")
    op.drop_table("municipios")
