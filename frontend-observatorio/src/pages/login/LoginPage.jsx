import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

export default function LoginPage() {
  const { login, verificarMfa, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState("senha");       // "senha" | "codigo"
  const [mfaToken, setMfaToken] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);

  // Navigate only after React has committed the user state — avoids
  // the ProtectedRoute seeing user===null and bouncing back to /login.
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/app", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await login(email, senha);
      if (r && r.mfa) {
        setMfaToken(r.mfaToken);
        setCodigo("");
        setUsarRecuperacao(false);
        setEtapa("codigo");
      }
    } catch {
      setError("Email ou senha incorretos. Verifique suas credenciais e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const voltarParaSenha = (aviso = "") => {
    setEtapa("senha");
    setMfaToken(null);
    setCodigo("");
    setUsarRecuperacao(false);
    setSenha("");
    setError(aviso);
  };

  const handleVerificar = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await verificarMfa(mfaToken, codigo);
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      const status = err?.response?.status;
      if (code === "MFA_TOKEN_INVALIDADO" || code === "MFA_SESSAO_INVALIDA") {
        voltarParaSenha("Sessão de verificação encerrada. Faça login de novo.");
      } else if (status === 503 || code === "MFA_INDISPONIVEL") {
        setError("MFA indisponível no servidor. Avise o administrador.");
      } else if (code === "UNAUTHORIZED") {
        setError("Código inválido. Confira o app autenticador e tente de novo.");
      } else {
        setError(mensagemDoErro(err, "Não foi possível verificar o código."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell
      titulo={etapa === "codigo" ? "Verificação em duas etapas" : "Acesse sua conta"}
      subtitulo={etapa === "codigo" ? "Código do app autenticador" : "Insira suas credenciais para continuar"}
    >
      {etapa === "codigo" ? (
        <form onSubmit={handleVerificar} className="space-y-4" noValidate>
          <p className="text-xs text-slate-500">
            Sua conta tem verificação em duas etapas. Digite o código do app autenticador.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-codigo" className={labelCls}>
              {usarRecuperacao ? "Código de recuperação" : "Código de verificação"}
            </label>
            <input
              id="login-codigo"
              type="text"
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value); if (error) setError(""); }}
              required
              autoFocus
              inputMode={usarRecuperacao ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={usarRecuperacao ? "XXXX-XXXX" : "000000"}
              maxLength={usarRecuperacao ? 9 : 7}
              className={`${inputCls} tracking-[0.3em] text-center`}
              aria-required="true"
            />
          </div>
          <ErroInline mensagem={error} />
          <button type="submit" disabled={loading || codigo.trim().length < 6} aria-busy={loading} className={btnPrimarioCls}>
            {loading ? "Verificando..." : "Verificar"}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => voltarParaSenha("")} className="text-slate-500 hover:text-slate-700 cursor-pointer">
              Voltar
            </button>
            <button type="button" onClick={() => { setUsarRecuperacao((v) => !v); setCodigo(""); setError(""); }} className={linkCls}>
              {usarRecuperacao ? "Usar código do app" : "Usar código de recuperação"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className={labelCls}>Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
              required
              autoComplete="email"
              autoFocus
              placeholder="seu@email.com"
              className={inputCls}
              aria-required="true"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-senha" className={labelCls}>Senha</label>
            <div className="relative">
              <input
                id="login-senha"
                type={showPassword ? "text" : "password"}
                value={senha}
                onChange={(e) => { setSenha(e.target.value); if (error) setError(""); }}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputCls} pr-11 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus:outline-none focus:text-slate-600 p-1"
              >
                {showPassword
                  ? <EyeSlashIcon className="w-4 h-4" aria-hidden="true" />
                  : <EyeIcon className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <ErroInline mensagem={error} />

          <button type="submit" disabled={loading} className={btnPrimarioCls} aria-busy={loading}>
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Entrando...</span>
              </>
            ) : (
              "Entrar"
            )}
          </button>

          <div className="text-center text-xs">
            <Link to="/esqueci-senha" className={linkCls}>Esqueci minha senha</Link>
          </div>
        </form>
      )}
    </LoginShell>
  );
}
