import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

// "Esqueci minha senha": sempre mostra a mesma mensagem de sucesso (o backend responde 202
// exista ou não a conta), para não revelar quais e-mails estão cadastrados.
export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      await api.post("/auth/esqueci-senha", { email: email.trim() });
      setEnviado(true);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) setErro("Muitas tentativas. Aguarde um minuto e tente de novo.");
      else if (status === 422) setErro("Informe um e-mail válido.");
      else setErro("Não foi possível enviar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell titulo="Esqueci minha senha" subtitulo={enviado ? "Confira sua caixa de entrada" : "Informe o e-mail da sua conta"}>
      {enviado ? (
        <div className="space-y-4 text-sm text-slate-600" role="status">
          <p>Se o e-mail estiver cadastrado, enviamos as instruções para redefinir a senha. Confira também a caixa de spam.</p>
          <p className="text-xs text-slate-400">O link vale por 30 minutos.</p>
          <Link to="/login" className={`${linkCls} text-xs`}>Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="esqueci-email" className={labelCls}>Email</label>
            <input
              id="esqueci-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (erro) setErro(""); }}
              required
              autoComplete="email"
              autoFocus
              placeholder="seu@email.com"
              className={inputCls}
              aria-required="true"
            />
          </div>
          <ErroInline mensagem={erro} />
          <button type="submit" disabled={loading || !email.trim()} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Enviando..." : "Enviar instruções"}
          </button>
          <div className="text-center text-xs">
            <Link to="/login" className={linkCls}>Voltar ao login</Link>
          </div>
        </form>
      )}
    </LoginShell>
  );
}
