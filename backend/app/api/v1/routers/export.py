"""Exportacao generica (menu Exportar dos paineis). Apenas ADMIN_GLOBAL.

Devolve os bytes direto (Response, nao StreamingResponse): o payload e limitado
a 50 mil celulas, cabe em memoria e fica testavel sem ASGI.
"""
from app.api.deps import require_role
from app.schemas.export import ExportXlsxIn
from app.services.export_service import MEDIA_XLSX, gerar_xlsx, nome_arquivo_xlsx
from fastapi import APIRouter, Depends, Response

router = APIRouter(prefix="/export", tags=["Export"])


@router.post("/xlsx")
def exportar_xlsx(
    dados: ExportXlsxIn,
    current_user=Depends(require_role("ADMIN_GLOBAL")),
):
    conteudo = gerar_xlsx(dados)
    nome = nome_arquivo_xlsx(dados)
    return Response(
        content=conteudo,
        media_type=MEDIA_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
