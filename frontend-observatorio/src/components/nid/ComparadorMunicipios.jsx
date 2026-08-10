import { useState } from "react";
import api from "../../services/api";
import MunicipioPicker from "./MunicipioPicker";

/**
 * "Comparar com…": fixa municípios extras num comparativo, além dos pares
 * automáticos. A lista de municípios só é buscada quando o usuário abre o
 * seletor — são ~5.500 linhas que não devem pesar no carregamento da página.
 */
export default function ComparadorMunicipios({ fixados = [], onChange, max = 3 }) {
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState([]);
  const noTeto = fixados.length >= max;

  const abrir = () => {
    setAberto(true);
    if (!opcoes.length) {
      api.get("/municipios/selecionaveis")
        .then((r) => setOpcoes(r.data || []))
        .catch(() => setOpcoes([]));
    }
  };

  const escolher = (id) => {
    if (!id) return;
    const n = Number(id);
    if (fixados.some((f) => f.municipio_id === n)) return;
    onChange([...fixados.map((f) => f.municipio_id), n]);
    setAberto(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
      {fixados.map((f) => (
        <span
          key={f.municipio_id}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border"
          style={{ background: "var(--panel-2)", borderColor: "var(--accent-1)", color: "var(--accent-1)" }}
        >
          {f.nome} — {f.estado}
          <button
            type="button"
            aria-label={`remover ${f.nome}`}
            onClick={() => onChange(fixados.filter((x) => x.municipio_id !== f.municipio_id)
                                          .map((x) => x.municipio_id))}
            className="ml-1 hover:opacity-70 cursor-pointer"
          >
            ✕
          </button>
        </span>
      ))}

      {noTeto ? (
        <span className="text-xs" style={{ color: "var(--text-mute)" }}>
          máximo de {max} municípios fixados
        </span>
      ) : aberto ? (
        <div style={{ minWidth: 240 }}>
          <MunicipioPicker
            municipios={opcoes}
            value=""
            onChange={escolher}
            placeholder="Escolha um município…"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          + comparar com…
        </button>
      )}
    </div>
  );
}
