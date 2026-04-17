from pydantic import BaseModel


class PixMensalItem(BaseModel):
    ano: int
    mes: int
    vl_pagador_pf: float | None = None
    qt_pagador_pf: int | None = None
    qt_pes_pagador_pf: int | None = None
    vl_pagador_pj: float | None = None
    qt_pagador_pj: int | None = None
    qt_pes_pagador_pj: int | None = None
    vl_recebedor_pf: float | None = None
    qt_recebedor_pf: int | None = None
    qt_pes_recebedor_pf: int | None = None
    vl_recebedor_pj: float | None = None
    qt_recebedor_pj: int | None = None
    qt_pes_recebedor_pj: int | None = None


class PixResumo(BaseModel):
    total_transacoes: int | None = None
    volume_total_pf: float | None = None
    volume_total_pj: float | None = None
