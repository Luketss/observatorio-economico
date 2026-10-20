import pytest
from pydantic import ValidationError

from app.schemas.suporte import AnotacaoCreate, StatusUpdate, TicketCreate, normalizar_whatsapp


@pytest.mark.parametrize("entrada,esperado", [
    ("(37) 99999-9999", "5537999999999"),
    ("+55 37 3333-4444", "553733334444"),
    ("5537999999999", "5537999999999"),
    ("37 3333 4444", "553733334444"),
    ("", None),
    (None, None),
])
def test_normalizar_whatsapp_aceita_formatos_brasileiros(entrada, esperado):
    assert normalizar_whatsapp(entrada) == esperado


@pytest.mark.parametrize("entrada", ["99999-9999", "0 37 99999-9999", "+1 415 555 0100", "abc"])
def test_whatsapp_invalido_rejeita(entrada):
    with pytest.raises(ValueError):
        normalizar_whatsapp(entrada)


def test_ticket_create_normaliza_e_strip():
    t = TicketCreate(mensagem="  Nao consigo exportar o PIB  ", whatsapp="(37) 99999-9999")
    assert t.mensagem == "Nao consigo exportar o PIB"
    assert t.whatsapp == "5537999999999"
    assert t.canal_preferido == "email"


def test_ticket_create_canal_whatsapp_exige_numero():
    with pytest.raises(ValidationError) as exc:
        TicketCreate(mensagem="Preciso de ajuda com o login", canal_preferido="whatsapp")
    assert "Informe o WhatsApp" in str(exc.value)


@pytest.mark.parametrize("msg", ["curta", "   oi   ", "x" * 4001])
def test_ticket_create_mensagem_fora_do_tamanho(msg):
    with pytest.raises(ValidationError):
        TicketCreate(mensagem=msg)


def test_status_update_e_anotacao():
    s = StatusUpdate(status="em_atendimento", texto="   ")
    assert s.texto is None
    with pytest.raises(ValidationError):
        StatusUpdate(status="fechado")
    with pytest.raises(ValidationError):
        AnotacaoCreate(texto="  ")
    assert AnotacaoCreate(texto=" liguei ").texto == "liguei"
