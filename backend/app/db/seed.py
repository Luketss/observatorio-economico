from app.core.permissions import PERMISSOES_TODAS
from app.core.security import hash_password
from app.models.role import Role
from app.models.usuario import Usuario
from sqlalchemy.orm import Session

# nome -> permissoes. ADMIN_GLOBAL tem bypass em codigo (JSON irrelevante);
# ANALISTA e VISUALIZADOR sao somente-leitura.
DEFAULT_ROLES = {
    "ADMIN_GLOBAL": {},
    "ADMIN_MUNICIPIO": PERMISSOES_TODAS,
    "ANALISTA": {},
    "VISUALIZADOR": {},
}


def seed_roles(db: Session):
    for role_name, permissoes in DEFAULT_ROLES.items():
        existing = db.query(Role).filter(Role.nome == role_name).first()
        if not existing:
            db.add(
                Role(
                    nome=role_name,
                    descricao=f"Role {role_name}",
                    builtin=True,
                    permissoes=permissoes,
                )
            )
        else:
            existing.builtin = True
            if role_name == "ADMIN_MUNICIPIO" and not existing.permissoes:
                existing.permissoes = permissoes
    db.commit()


def seed_admin_global(db: Session):
    admin_role = db.query(Role).filter(Role.nome == "ADMIN_GLOBAL").first()

    if not admin_role:
        return

    existing_admin = (
        db.query(Usuario).filter(Usuario.email == "admin@observatorio.com").first()
    )

    if not existing_admin:
        admin = Usuario(
            nome="Administrador Global",
            email="admin@observatorio.com",
            senha_hash=hash_password("admin123"),
            role_id=admin_role.id,
            municipio_id=None,
            ativo=True,
        )
        db.add(admin)
        db.commit()


def run_seed(db: Session):
    seed_roles(db)
    seed_admin_global(db)
