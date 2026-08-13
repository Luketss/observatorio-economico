// Preset de período POR GRÁFICO (override do filtro da página).
// Aplica sempre sobre a série CRUA, com âncora no último dado da própria
// série — reusa janela12m/dentroDoFiltro (mesma régua do resto do app).
import { dentroDoFiltro, janela12m } from "./periodoCards";

export const PRESETS_PAINEL = [
  { key: "12m", label: "12m" },
  { key: "5a", label: "5a" },
  { key: "10a", label: "10a" },
  { key: "tudo", label: "Tudo" },
];

function maiorAno(serie, extrair) {
  let max = null;
  for (const d of serie) {
    const { ano } = extrair(d) || {};
    if (ano != null && (max == null || ano > max)) max = ano;
  }
  return max;
}

export function aplicarPresetSerie(rawSerie, preset, extrair) {
  const serie = rawSerie || [];
  if (!serie.length || preset === "tudo") return serie;
  if (preset === "12m") {
    const filtro = janela12m(serie, extrair);
    return serie.filter((d) => dentroDoFiltro(d, filtro, extrair));
  }
  const span = preset === "5a" ? 5 : preset === "10a" ? 10 : null;
  if (span == null) return serie;
  const max = maiorAno(serie, extrair);
  if (max == null) return serie;
  const filtro = {
    yearFrom: String(max - span + 1),
    yearTo: String(max),
    monthFrom: "",
    monthTo: "",
  };
  return serie.filter((d) => dentroDoFiltro(d, filtro, extrair));
}

export function resolverSeriePainel({ rawSerie, seriePagina, preset, extrair }) {
  if (!preset) return seriePagina;
  return aplicarPresetSerie(rawSerie, preset, extrair);
}
