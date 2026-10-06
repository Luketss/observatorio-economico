// Menu "Exportar" do cabeçalho do NidPanel. Só ADMIN_GLOBAL, só com gráfico
// registrado no ExportContext. CSV e PNG no navegador; XLSX via backend.
// Best-effort: erro vira toast, nunca quebra o painel.
// Spec: docs/superpowers/specs/2026-10-06-exportacao-graficos-design.md
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useViewAs } from "../../context/ViewAsContext";
import { useToast } from "../../context/ToastContext";
import { useExportacoes } from "./ExportContext";
import { FONTES_DATASET, baixarBlob, datasetDe, gerarCsv, nomeArquivo, rodapePng, svgParaPng } from "../../utils/exportar";

const MSG_LIMITE = "Tabela grande demais para exportar (limite de 50 mil células)";
const MSG_XLSX = "Falha ao gerar a planilha. Tente novamente.";

export default function ExportMenu({ titulo, sub, dataset }) {
  const { user } = useAuth() || {};
  const viewAs = useViewAs() || {};
  const { addToast } = useToast();
  const registros = useExportacoes();
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const raizRef = useRef(null);

  const fechar = useCallback((devolverFoco) => {
    setAberto(false);
    if (devolverFoco && botaoRef.current) botaoRef.current.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => { if (e.key === "Escape") fechar(true); };
    const onDown = (e) => { if (raizRef.current && !raizRef.current.contains(e.target)) fechar(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [aberto, fechar]);

  if (!user || user.role !== "ADMIN_GLOBAL" || registros.length === 0) return null;

  const prontos = registros.filter((r) => !r.carregando && Array.isArray(r.linhas) && r.linhas.length > 0);
  const desabilitado = prontos.length === 0;
  const ds = datasetDe(dataset, window.location.pathname);
  const municipio = viewAs.viewAsNome || "";
  const subTexto = typeof sub === "string" ? sub : "";
  const varios = prontos.length > 1;

  const nome = (ext) => nomeArquivo({ dataset: ds, painel: titulo, municipio, ext });

  const exportarCsv = (reg) => {
    const csv = gerarCsv(reg.colunas, reg.linhas);
    baixarBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), nome("csv"));
  };

  const exportarXlsx = async (reg) => {
    try {
      const res = await api.post(
        "/export/xlsx",
        {
          titulo,
          subtitulo: subTexto || null,
          fonte: FONTES_DATASET[ds] || null,
          municipio: municipio || null,
          dataset: ds || null,
          colunas: reg.colunas,
          linhas: reg.linhas,
        },
        { responseType: "blob" }
      );
      baixarBlob(res.data, nome("xlsx"));
    } catch (err) {
      addToast(err?.response?.status === 422 ? MSG_LIMITE : MSG_XLSX, "error");
    }
  };

  const exportarPng = async (reg) => {
    try {
      const blob = await svgParaPng(reg.svgRef ? reg.svgRef.current : null, {
        titulo,
        sub: subTexto,
        rodape: rodapePng(ds),
      });
      baixarBlob(blob, nome("png"));
    } catch (err) {
      addToast(err?.message || "Não foi possível gerar a imagem", "error");
    }
  };

  const agir = (fn, reg) => {
    fechar(false);
    fn(reg);
  };

  const itens = [];
  // svgRef.current so e lido dentro do onClick (exportarPng), nunca no render: falso positivo do lint.
  // eslint-disable-next-line react-hooks/refs
  prontos.forEach((reg) => {
    const sufixo = varios ? ` · ${reg.rotulo}` : "";
    itens.push({ chave: `csv-${reg.id}`, texto: `CSV${sufixo}`, onClick: () => agir(exportarCsv, reg) });
    itens.push({ chave: `xlsx-${reg.id}`, texto: `XLSX${sufixo}`, onClick: () => agir(exportarXlsx, reg) });
    if (reg.svgRef) itens.push({ chave: `png-${reg.id}`, texto: `PNG${sufixo}`, onClick: () => agir(exportarPng, reg) });
  });

  return (
    <div ref={raizRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={botaoRef}
        type="button"
        className="nid-tab"
        aria-label="Exportar"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-disabled={desabilitado}
        title={desabilitado ? "Sem dados para exportar" : "Exportar dados do gráfico"}
        onClick={() => { if (!desabilitado) setAberto((v) => !v); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: desabilitado ? 0.5 : 1, cursor: desabilitado ? "not-allowed" : "pointer" }}
      >
        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} aria-hidden="true" />
        Exportar
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Formatos de exportação"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 160,
            background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 4,
          }}
        >
          {itens.map((it) => (
            <button
              key={it.chave}
              type="button"
              role="menuitem"
              onClick={it.onClick}
              className="nid-tab"
              style={{ display: "block", width: "100%", textAlign: "left", textTransform: "none", letterSpacing: 0, fontFamily: "inherit", fontSize: 12 }}
            >
              {it.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
