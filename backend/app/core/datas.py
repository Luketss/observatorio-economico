"""Data de referência "hoje" no fuso do Brasil.

O servidor (Railway) roda em UTC; entre 21h e 0h em Brasília, `date.today()`
já é amanhã — uma próxima ação que vence hoje apareceria vencida três horas
antes e os limiares de 90/30 dias andariam um dia. Fuso fixo -3: o Brasil
não tem horário de verão desde 2019, e assim não dependemos de `tzdata`
(ausente no Windows de desenvolvimento).
"""
from datetime import date, datetime, timedelta, timezone

FUSO_BRASIL = timezone(timedelta(hours=-3), name="Brasil (fixo -3)")


def hoje_local() -> date:
    return datetime.now(FUSO_BRASIL).date()
