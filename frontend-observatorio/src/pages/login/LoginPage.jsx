import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowLeftIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import bg from "../../assets/bg.jpeg";
import nidLogo from "../../assets/nid_fundo_transparente.png";
import logo from "../../assets/logo_uaizi.png";

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    try {
      await login(email, senha);
      // Navigation is handled by the useEffect above once user state is committed.
    } catch {
      setError("Email ou senha incorretos. Verifique suas credenciais e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4 py-8">

      {/* Background photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bg})` }}
        aria-hidden="true"
      />
      {/* Dark overlay with gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-slate-950/95" aria-hidden="true" />
      {/* Subtle blue glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-blue-950/30 via-transparent to-transparent" aria-hidden="true" />

      {/* Back to landing */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="absolute top-6 left-6"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 text-xs font-medium transition-colors group focus:outline-none focus:text-white/80"
          aria-label="Voltar para página inicial"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
          Voltar
        </Link>
      </motion.div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-5">

        {/* NID logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={nidLogo}
            alt="NID — Núcleo de Inteligência de Dados"
            className="h-28 object-contain mx-auto"
            style={{
              filter: "drop-shadow(0 0 24px rgba(59,130,246,0.5)) drop-shadow(0 0 48px rgba(99,102,241,0.25))",
            }}
          />
        </motion.div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: "easeOut" }}
          className="w-full"
        >
          <div className="w-full bg-white/[0.97] backdrop-blur-md rounded-2xl shadow-2xl shadow-black/40 border border-white/20 p-8">
            {/* Card header */}
            <div className="mb-7 text-center">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Acesse sua conta</h1>
              <p className="text-slate-400 text-xs mt-1">Insira suas credenciais para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  aria-required="true"
                />
              </div>

              {/* Senha */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-senha" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="login-senha"
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => { setSenha(e.target.value); if (error) setError(""); }}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
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

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-xs px-4 py-3 rounded-xl"
                >
                  <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50 cursor-pointer mt-2"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Entrando...</span>
                  </>
                ) : (
                  "Entrar"
                )}
              </button>
            </form>
          </div>
        </motion.div>

        {/* UAIZI branding */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-2"
        >
          <img src={logo} alt="UAIZI" className="h-10 object-contain opacity-70" />
          <p className="text-white/25 text-[10px] tracking-widest uppercase">
            Observatório Econômico Municipal
          </p>
        </motion.div>
      </div>
    </div>
  );
}
