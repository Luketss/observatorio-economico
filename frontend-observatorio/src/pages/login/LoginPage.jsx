import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import LoginShell, { ErroInline } from "./LoginShell";
import { btnPrimarioCls, inputCls, labelCls, linkCls } from "./loginEstilos";

const COOLDOWN_REENVIO = 60;
const MAX_REENVIOS = 3;

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

export default function LoginPage() {
  const { login, verificarMfa, reenviarCodigoMfa, user, loading: authLoading } = useAuth();
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
  const [metodo, setMetodo] = useState("totp");        // "totp" | "email"
  const [enviadoPara, setEnviadoPara] = useState("");
  const [envioFalhou, setEnvioFalhou] = useState(false);
  const [cooldown, setCooldown] = useState(0);         // segundos ate liberar "Reenviar"
  const [reenvios, setReenvios] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState("");

  const emCooldown = cooldown > 0;
  useLayoutEffect(() => {
    if (!emCooldown) return undefined;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [emCooldown]);

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
        const porEmail = r.metodo === "email";
        setMetodo(porEmail ? "email" : "totp");
        setEnviadoPara(r.enviadoPara || "");
        setEnvioFalhou(porEmail && r.enviado === false);
        setCooldown(porEmail && r.enviado !== false ? COOLDOWN_REENVIO : 0);
        setReenvios(0);
        setAviso("");
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
    setMetodo("totp");
    setEnviadoPara("");
    setEnvioFalhou(false);
    setCooldown(0);
    setReenvios(0);
    setAviso("");
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
        setError(metodo === "email"
          ? "Código inválido ou expirado. Confira o e-mail ou peça um novo código."
          : "Código inválido. Confira o app autenticador e tente de novo.");
      } else {
        setError(mensagemDoErro(err, "Não foi possível verificar o código."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReenviar = async () => {
    setReenviando(true);
    setError("");
    setAviso("");
    try {
      const r = await reenviarCodigoMfa(mfaToken);
      if (r && r.enviado_para) setEnviadoPara(r.enviado_para);
      setEnvioFalhou(false);
      setReenvios((n) => n + 1);
      setCooldown(COOLDOWN_REENVIO);
      setAviso("Enviamos um novo código. O anterior deixou de valer.");
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      const msg = mensagemDoErro(err, "Não foi possível reenviar o código.");
      if (code === "MFA_TOKEN_INVALIDADO" || code === "MFA_SESSAO_INVALIDA") {
        voltarParaSenha("Sessão de verificação encerrada. Faça login de novo.");
      } else if (code === "LIMITE_REENVIO") {
        setReenvios(MAX_REENVIOS);
        setError(msg);
      } else if (code === "AGUARDE") {
        const m = /(\d+)/.exec(msg);
        setCooldown(m ? Number(m[1]) : COOLDOWN_REENVIO);
        setError(msg);
      } else if (err?.response?.status === 502) {
        setError("Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
      } else {
        setError(msg);
      }
    } finally {
      setReenviando(false);
    }
  };

  return (
    <LoginShell
      titulo={etapa === "codigo" ? "Verificação em duas etapas" : "Acesse sua conta"}
      subtitulo={etapa === "codigo" ? (metodo === "email" ? "Código enviado por e-mail" : "Código do app autenticador") : "Insira suas credenciais para continuar"}
    >
      {etapa === "codigo" ? (
        <form onSubmit={handleVerificar} className="space-y-4" noValidate>
          {metodo === "email" ? (
            <p className="text-xs text-slate-500">
              Enviamos um código para {enviadoPara}. Ele vale por 10 minutos.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Sua conta tem verificação em duas etapas. Digite o código do app autenticador.
            </p>
          )}
          {envioFalhou && (
            <p className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-4 py-3 rounded-xl">
              Não conseguimos enviar o e-mail agora. Use "Reenviar código" para tentar de novo.
            </p>
          )}
          {aviso && (
            <p role="status" className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-3 rounded-xl">{aviso}</p>
          )}
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
          {metodo === "email" && reenvios < MAX_REENVIOS && (
            <button type="button" onClick={handleReenviar} disabled={reenviando || cooldown > 0}
              className="w-full text-xs text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer">
              {cooldown > 0 ? `Reenviar código (${cooldown}s)` : reenviando ? "Reenviando..." : "Reenviar código"}
            </button>
          )}
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => voltarParaSenha("")} className="text-slate-500 hover:text-slate-700 cursor-pointer">
              Voltar
            </button>
            <button type="button" onClick={() => { setUsarRecuperacao((v) => !v); setCodigo(""); setError(""); }} className={linkCls}>
              {usarRecuperacao ? (metodo === "email" ? "Usar código do e-mail" : "Usar código do app") : "Usar código de recuperação"}
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
