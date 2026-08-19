"""gestao empresarial: vinculo RFB, proxima acao, contatos e demandas

Revision ID: 0038_gestao_empresarial
Revises: 0037_acao_audit
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0038_gestao_empresarial'
down_revision = '0037_acao_audit'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('empresa_retencao', sa.Column('cnpj_basico', sa.String(length=8), nullable=True))
    op.add_column('empresa_retencao', sa.Column('proxima_acao', sa.Text(), nullable=True))
    op.add_column('empresa_retencao', sa.Column('proxima_acao_data', sa.Date(), nullable=True))
    op.create_index(op.f('ix_empresa_retencao_cnpj_basico'), 'empresa_retencao', ['cnpj_basico'], unique=False)

    op.create_table('contato_empresa',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('empresa_id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('criado_por', sa.Integer(), nullable=True),
    sa.Column('data', sa.Date(), nullable=False),
    sa.Column('tipo', sa.String(length=20), nullable=False, server_default='reuniao'),
    sa.Column('responsavel', sa.String(length=150), nullable=True),
    sa.Column('observacoes', sa.Text(), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=True),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['criado_por'], ['usuarios.id'], ),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresa_retencao.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contato_empresa_empresa_id'), 'contato_empresa', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_contato_empresa_id'), 'contato_empresa', ['id'], unique=False)
    op.create_index(op.f('ix_contato_empresa_municipio_id'), 'contato_empresa', ['municipio_id'], unique=False)

    op.create_table('demanda_empresa',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('empresa_id', sa.Integer(), nullable=False),
    sa.Column('municipio_id', sa.Integer(), nullable=False),
    sa.Column('criado_por', sa.Integer(), nullable=True),
    sa.Column('descricao', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False, server_default='aberta'),
    sa.Column('data_registro', sa.Date(), nullable=False),
    sa.Column('responsavel', sa.String(length=150), nullable=True),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=True),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['criado_por'], ['usuarios.id'], ),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresa_retencao.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['municipio_id'], ['municipios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_demanda_empresa_empresa_id'), 'demanda_empresa', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_demanda_empresa_id'), 'demanda_empresa', ['id'], unique=False)
    op.create_index(op.f('ix_demanda_empresa_municipio_id'), 'demanda_empresa', ['municipio_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_demanda_empresa_municipio_id'), table_name='demanda_empresa')
    op.drop_index(op.f('ix_demanda_empresa_id'), table_name='demanda_empresa')
    op.drop_index(op.f('ix_demanda_empresa_empresa_id'), table_name='demanda_empresa')
    op.drop_table('demanda_empresa')

    op.drop_index(op.f('ix_contato_empresa_municipio_id'), table_name='contato_empresa')
    op.drop_index(op.f('ix_contato_empresa_id'), table_name='contato_empresa')
    op.drop_index(op.f('ix_contato_empresa_empresa_id'), table_name='contato_empresa')
    op.drop_table('contato_empresa')

    op.drop_index(op.f('ix_empresa_retencao_cnpj_basico'), table_name='empresa_retencao')
    op.drop_column('empresa_retencao', 'proxima_acao_data')
    op.drop_column('empresa_retencao', 'proxima_acao')
    op.drop_column('empresa_retencao', 'cnpj_basico')
