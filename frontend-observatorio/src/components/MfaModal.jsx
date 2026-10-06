// Verificação em duas etapas (TOTP) — só ADMIN_GLOBAL. Passos: status → qr
// (QR + código de confirmação) → codigos (mostrados uma única vez). Desativar exige senha + código.
// Spec: docs/superpowers/specs/2026-10-06-mfa-totp-admin-global-design.md
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useToast } from "../context/ToastContext";
import { useEscapeKey } from "../hooks/useEscapeKey";

function mensagemDoErro(err, padrao) {
  return err?.response?.data?.error?.message || err?.response?.data?.detail || padrao;
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] text-sm outline-none focus:ring-2 focus:ring-blue-500";
const btnPrimario = "w-full py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-opacity";
const btnSecundario = "px-3 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--text-dim)] hover:bg-[var(--panel-2)] cursor-pointer";

export default function MfaModal({ open, onClose }) {
  const { addToast } = useToast();
  const [passo, setPasso] = useState("status"); // status | qr (QR + confirmar) | codigos | desativar
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [codigosRecuperacao, setCodigosRecuperacao] = useState([]);
  const [guardei, setGuardei] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const fechar = useCallback(() => {
    setPasso("status"); setConfig(null); setCodigo(""); setSenhaAtual("");
    setCodigosRecuperacao([]); setGuardei(false); setErro("");
    onClose();
  }, [onClose]);

  useEscapeKey(fechar, open && passo !== "codigos");

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setErro(""); setIndisponivel(false); setStatus(null);
    api.get("/auth/mfa/status")
      .then((r) => { if (vivo) setStatus(r.data.data); })
      .catch((err) => {
        if (!vivo) return;
        if (err?.response?.status === 503) setIndisponivel(true);
        setErro(mensagemDoErro(err, "Não foi possível consultar o status do MFA."));
      });
    return () => { vivo = false; };
  }, [open]);

  async function iniciar() {
    setErro(""); setCarregando(true);
    try {
      const r = await api.post("/auth/mfa/configurar");
      setConfig(r.data.data); setCodigo(""); setPasso("qr");
    } catch (err) {
      if (err?.response?.status === 503) setIndisponivel(true);
      setErro(mensagemDoErro(err, "Não foi possível iniciar a configuração."));
    } finally { setCarregando(false); }
  }

  async function confirmar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    try {
      const r = await api.post("/auth/mfa/ativar", { codigo });
      setCodigosRecuperacao(r.data.data.codigos_recuperacao || []);
      setGuardei(false); setPasso("codigos");
    } catch (err) {
      setErro(mensagemDoErro(err, "Código inválido."));
    } finally { setCarregando(false); }
  }

  async function copiarTodos() {
    try {
      await navigator.clipboard.writeText(codigosRecuperacao.join("\n"));
      setGuardei(true);
      addToast("Códigos copiados.", "success");
    } catch {
      setErro("Não foi possível copiar. Anote os códigos manualmente e marque 'Já guardei'.");
    }
  }

  async function desativar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    try {
      await api.post("/auth/mfa/desativar", { senha_atual: senhaAtual, codigo });
      addToast("Verificação em duas etapas desativada.", "success");
      fechar();
    } catch (err) {
      setErro(mensagemDoErro(err, "Não foi possível desativar."));
    } finally { setCarregando(false); }
  }

  function concluir() {
    addToast("Verificação em duas etapas ativada.", "success");
    fechar();
  }

  const alerta = erro && (
    <p className="text-xs" style={{ color: "var(--accent-2)" }} role="alert">{erro}</p>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && passo !== "codigos") fechar(); }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md rounded-2xl shadow-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-3"
            role="dialog" aria-modal="true" aria-labelledby="mfa-titulo">
            <div className="flex items-center justify-between">
              <h2 id="mfa-titulo" className="text-sm font-semibold text-[var(--text)]">Segurança · verificação em duas etapas</h2>
              {passo !== "codigos" && (
                <button type="button" onClick={fechar} aria-label="Fechar"
                  className="p-1 rounded-lg text-[var(--text-mute)] hover:text-[var(--text-dim)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {passo === "status" && (
              <div className="space-y-3 text-sm text-[var(--text-dim)]">
                {alerta}
                {status && !status.ativo && !indisponivel && (
                  <>
                    <p>Proteja sua conta exigindo um código do app autenticador (Google Authenticator, Authy, 1Password…) depois da senha.</p>
                    <button type="button" onClick={iniciar} disabled={carregando} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>
                      {carregando ? "Preparando..." : "Ativar verificação em duas etapas"}
                    </button>
                  </>
                )}
                {status && status.ativo && (
                  <>
                    <p>Ativa desde {status.ativado_em ? new Date(status.ativado_em).toLocaleDateString("pt-BR") : "—"}.</p>
                    <p>{status.codigos_restantes} códigos de recuperação restantes.</p>
                    <button type="button" onClick={() => { setErro(""); setCodigo(""); setSenhaAtual(""); setPasso("desativar"); }} className={btnSecundario}>
                      Desativar
                    </button>
                  </>
                )}
                {!status && !erro && <p>Carregando…</p>}
              </div>
            )}

            {passo === "qr" && config && (
              <form onSubmit={confirmar} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>1. Leia o QR no app autenticador ou digite o segredo manualmente.</p>
                <div className="flex justify-center bg-white rounded-xl p-3 [&>svg]:w-44 [&>svg]:h-44" dangerouslySetInnerHTML={{ __html: config.qr_svg }} />
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all px-2 py-1 rounded bg-[var(--panel-2)] text-[var(--text)]">{config.segredo}</code>
                  <button type="button" className={btnSecundario} onClick={async () => { try { await navigator.clipboard.writeText(config.segredo); addToast("Segredo copiado.", "success"); } catch { setErro("Não foi possível copiar. Digite o segredo manualmente."); } }}>Copiar</button>
                </div>
                <p>2. Digite o código de 6 dígitos que o app mostra agora.</p>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Código do app" placeholder="000000"
                  value={codigo} onChange={(e) => setCodigo(e.target.value)} required maxLength={7} className={inputCls} />
                {alerta}
                <div className="flex gap-2">
                  <button type="button" className={btnSecundario} onClick={() => { setErro(""); setConfig(null); setPasso("status"); }}>Voltar</button>
                  <button type="submit" disabled={carregando || codigo.trim().length < 6} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>
                    {carregando ? "Verificando..." : "Confirmar"}
                  </button>
                </div>
              </form>
            )}

            {passo === "codigos" && (
              <div className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>3. Guarde estes códigos de recuperação. <strong>Eles não aparecem de novo.</strong> Cada um vale uma vez, se você perder o app.</p>
                <ul className="grid grid-cols-2 gap-1 font-mono text-xs text-[var(--text)]">
                  {codigosRecuperacao.map((c) => <li key={c} className="px-2 py-1 rounded bg-[var(--panel-2)]">{c}</li>)}
                </ul>
                <div className="flex items-center gap-2">
                  <button type="button" className={btnSecundario} onClick={copiarTodos}>Copiar todos</button>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={guardei} onChange={(e) => setGuardei(e.target.checked)} aria-label="Já guardei os códigos" />
                    Já guardei os códigos
                  </label>
                </div>
                {alerta}
                <button type="button" onClick={concluir} disabled={!guardei} className={btnPrimario} style={{ background: "var(--accent-1)", color: "var(--bg)" }}>Concluir</button>
              </div>
            )}

            {passo === "desativar" && (
              <form onSubmit={desativar} className="space-y-3 text-sm text-[var(--text-dim)]">
                <p>Para desativar, confirme sua senha e um código do app (ou um código de recuperação).</p>
                <input type="password" aria-label="Senha atual" placeholder="Senha atual" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required autoComplete="current-password" className={inputCls} />
                <input type="text" aria-label="Código" placeholder="Código do app ou XXXX-XXXX" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoComplete="one-time-code" className={inputCls} />
                {alerta}
                <div className="flex gap-2">
                  <button type="button" className={btnSecundario} onClick={() => { setErro(""); setPasso("status"); }}>Voltar</button>
                  <button type="submit" disabled={carregando} className={btnPrimario} style={{ background: "var(--accent-2)", color: "var(--bg)" }}>
                    {carregando ? "Desativando..." : "Confirmar desativação"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
