"""Núcleo de permissões por área × verbo.

Funções puras (sem DB): recebem o objeto Role (ou qualquer objeto com
.nome/.permissoes) e primitivos. ADMIN_GLOBAL tem bypass total — o JSON
de permissões dele é irrelevante.
"""

AREAS = (
    "projetos",
    "captacao",
    "funil",
    "escrita",
    "premiacoes",
    "retencao",
    "dados_internos",
    "mandato",
    "usuarios",
    "prioridades",
)

VERBOS = ("criar", "editar", "excluir")

AREA_LABELS = {
    "projetos": "Projetos",
    "captacao": "Captação de Recursos",
    "funil": "Funil de Investimentos",
    "escrita": "Escrita de Projetos",
    "premiacoes": "Premiações",
    "retencao": "Retenção & Expansão",
    "dados_internos": "Dados Internos",
    "mandato": "Timeline do Mandato",
    "usuarios": "Usuários do Município",
    "prioridades": "Prioridades do Mês",
}

PERMISSOES_TODAS = {area: list(VERBOS) for area in AREAS}


def tem_permissao(role, area: str, verbo: str) -> bool:
    if role is None:
        return False
    if role.nome == "ADMIN_GLOBAL":
        return True
    permissoes = role.permissoes or {}
    return verbo in permissoes.get(area, [])


def permissoes_efetivas(role) -> dict:
    """Mapa completo e saneado para o /auth/me (áreas/verbos válidos apenas)."""
    if role is None:
        return {}
    if role.nome == "ADMIN_GLOBAL":
        return PERMISSOES_TODAS
    permissoes = role.permissoes or {}
    efetivas = {}
    for area in AREAS:
        verbos = [v for v in VERBOS if v in permissoes.get(area, [])]
        if verbos:
            efetivas[area] = verbos
    return efetivas


def valida_atribuicao(
    role_municipio_id: int | None, usuario_municipio_id: int | None
) -> bool:
    """Role global (municipio_id None) serve para qualquer usuário;
    role municipal só para usuário do mesmo município."""
    return role_municipio_id is None or role_municipio_id == usuario_municipio_id


def pode_gerenciar_usuario(
    ator_role_nome: str,
    ator_municipio_id: int | None,
    alvo_role_nome: str,
    alvo_municipio_id: int | None,
) -> bool:
    """Guardas anti-escalação da delegação de usuários. Fail-closed: ator
    não-global sem município não gerencia ninguém (NULL == NULL não autoriza)."""
    if ator_role_nome == "ADMIN_GLOBAL":
        return True
    if alvo_role_nome == "ADMIN_GLOBAL":
        return False
    if ator_municipio_id is None:
        return False
    return alvo_municipio_id == ator_municipio_id


def escopo_listagem_usuarios(role, municipio_id: int | None) -> int | None:
    """Escopo fail-closed do GET /usuarios: devolve o municipio_id a filtrar
    (None = sem filtro, só ADMIN_GLOBAL). Nega quem não tem nenhum verbo na
    área 'usuarios' e nega não-global sem município — municipio_id NULL nunca
    pode degradar para "listar tudo"."""
    from app.core.exceptions import ForbiddenException

    if role is not None and role.nome == "ADMIN_GLOBAL":
        return None
    if not any(tem_permissao(role, "usuarios", verbo) for verbo in VERBOS):
        raise ForbiddenException("Sem permissão para ver usuários.")
    if municipio_id is None:
        raise ForbiddenException(
            "Usuário sem município vinculado não pode listar usuários."
        )
    return municipio_id


def erros_permissoes(permissoes) -> list[str]:
    """Valida o payload {area: [verbos]} do CRUD de roles. Retorna lista de erros."""
    if not isinstance(permissoes, dict):
        return ["permissoes deve ser um objeto {area: [verbos]}"]
    erros = []
    for area, verbos in permissoes.items():
        if area not in AREAS:
            erros.append(f"área inválida: {area}")
            continue
        if not isinstance(verbos, list):
            erros.append(f"verbos de '{area}' devem ser uma lista")
            continue
        for verbo in verbos:
            if verbo not in VERBOS:
                erros.append(f"verbo inválido em '{area}': {verbo}")
    return erros
