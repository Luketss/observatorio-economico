import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

// Lê ?token=, valida no backend e troca a senha. Estados: validando | invalido | erro | form | sucesso.
export default function RedefinirSenhaPage() {
  const [params] = useSearchParams();
  const token = (params.get("token") || "").trim();
  const [estado, setEstado] = useState(token ? "validando" : "invalido");
  const [tentativa, setTentativa] = useState(0);
  const [emailMascarado, setEmailMascarado] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let vivo = true;
    api.get("/auth/redefinir-senha/validar", { params: { token } })
      .then((r) => {
        if (!vivo) return;
        setEmailMascarado(r.data?.email_mascarado || "");
        setEstado("form");
      })
      .catch((err) => {
        if (!vivo) return;
        const status = err?.response?.status;
        setEstado(status === 410 || status === 422 ? "invalido" : "erro");
      });
    return () => { vivo = false; };
  }, [token, tentativa]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmar) { setErro("As senhas não coincidem."); return; }
    setLoading(true);
    try {
      await api.post("/auth/redefinir-senha", { token, nova_senha: senha });
      setEstado("sucesso");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 410) setEstado("invalido");
      else if (status === 429) setErro("Muitas tentativas. Aguarde um minuto e tente de novo.");
      else setErro(mensagemDoErro(err, "Não foi possível redefinir a senha agora. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  const subtitulos = {
    validando: "Validando o link…",
    invalido: "Link inválido",
    erro: "Não foi possível validar o link",
    form: emailMascarado ? `Conta: ${emailMascarado}` : "Escolha a nova senha",
    sucesso: "Tudo certo",
  };

  return (
    <LoginShell titulo="Redefinir senha" subtitulo={subtitulos[estado]}>
      {estado === "validando" && <p className="text-sm text-slate-500" role="status">Validando o link…</p>}

      {estado === "invalido" && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Este link expirou ou já foi usado. Peça um novo link para redefinir a senha.</p>
          <div className="flex items-center justify-between text-xs">
            <Link to="/login" className="text-slate-500 hover:text-slate-700">Voltar ao login</Link>
            <Link to="/esqueci-senha" className={linkCls}>Pedir outro link</Link>
          </div>
        </div>
      )}

      {estado === "erro" && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Não foi possível validar o link agora. Verifique sua conexão e tente de novo.</p>
          <button type="button" onClick={() => { setEstado("validando"); setTentativa((n) => n + 1); }} className={btnPrimarioCls}>Tentar de novo</button>
        </div>
      )}

      {estado === "form" && (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="redefinir-senha" className={labelCls}>Nova senha</label>
            <input id="redefinir-senha" type="password" value={senha} onChange={(e) => { setSenha(e.target.value); if (erro) setErro(""); }}
              required minLength={6} autoComplete="new-password" autoFocus placeholder="mínimo 6 caracteres" className={inputCls} aria-required="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="redefinir-confirmar" className={labelCls}>Confirmar nova senha</label>
            <input id="redefinir-confirmar" type="password" value={confirmar} onChange={(e) => { setConfirmar(e.target.value); if (erro) setErro(""); }}
              required minLength={6} autoComplete="new-password" placeholder="repita a senha" className={inputCls} aria-required="true" />
          </div>
          <ErroInline mensagem={erro} />
          <button type="submit" disabled={loading || !senha || !confirmar} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      )}

      {estado === "sucesso" && (
        <div className="space-y-4 text-sm text-slate-600" role="status">
          <p>Senha redefinida. Use a nova senha para entrar.</p>
          <Link to="/login" className={`${btnPrimarioCls} no-underline`}>Ir para o login</Link>
        </div>
      )}
    </LoginShell>
  );
}
