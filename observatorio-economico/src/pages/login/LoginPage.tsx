import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../app/store/authStore";
import { motion } from "framer-motion";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    const success = await login(username, password);

    if (success) {
      navigate("/");
    } else {
      alert("Credenciais inválidas");
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      
      {/* Background glow */}
      <div className="absolute w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-3xl top-[-200px] left-[-200px]" />
      <div className="absolute w-[500px] h-[500px] bg-indigo-400/20 rounded-full blur-3xl bottom-[-200px] right-[-150px]" />

      {/* Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative backdrop-blur-xl bg-white/80 dark:bg-slate-900/70 border border-white/40 dark:border-slate-700 shadow-2xl rounded-3xl p-10 w-full max-w-md"
      >
        {/* Identidade visual */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-blue-700 dark:text-blue-400 tracking-tight">
            Observatório Econômico
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Prefeitura Municipal de Oliveira
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-300">
              Usuário
            </label>
            <input
              type="text"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-300">
              Senha
            </label>
            <input
              type="password"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-3 rounded-xl mt-4 transition-all shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            Entrar
          </button>
        </form>
      </motion.div>
    </div>
  );
}
