/**
 * Janela de período para os KPI cards ("12 meses ancorados no último dado").
 *
 * Shape de retorno = estado da FilterBar (strings):
 *   { yearFrom, monthFrom, yearTo, monthTo }   — "" = sem restrição ("Tudo").
 *
 * A janela NUNCA é ancorada no calendário: datasets com defasagem (PIB/VAF
 * ~2 anos) abririam vazios. Exceção deliberada: Empresas (cadastro corrente)
 * usa janela12mCalendario — lá o calendário é o correto (Task 4).
 */

const VAZIO = { yearFrom: "", monthFrom: "", yearTo: "", monthTo: "" };

// Chave linear de mês (ano*12 + mes-1) — permite janela que cruza o ano.
const chaveMes = (ano, mes) => ano * 12 + (mes - 1);

/**
 * Janela de 12 meses terminando no ÚLTIMO ponto da série.
 * `extrair(item)` → { ano, mes } (mensal) ou { ano } (anual) ou null (ignora).
 *  - Mensal: 12 meses ancorados no último dado; início clampado no primeiro
 *    ponto da série (série de 1 ponto → o próprio ponto).
 *  - Anual (nenhum ponto tem mes): { yearFrom: anoUltimo, yearTo: anoUltimo }.
 *  - Série vazia: filtro vazio ("Tudo").
 */
export function janela12m(serie, extrair) {
  const pontos = (serie || []).map(extrair).filter((p) => p && p.ano != null);
  if (!pontos.length) return { ...VAZIO };

  const mensais = pontos.filter((p) => p.mes != null && !Number.isNaN(+p.mes));
  if (!mensais.length) {
    const anoUltimo = Math.max(...pontos.map((p) => +p.ano));
    return { yearFrom: String(anoUltimo), monthFrom: "", yearTo: String(anoUltimo), monthTo: "" };
  }

  const chaves = mensais.map((p) => chaveMes(+p.ano, +p.mes));
  const fim = Math.max(...chaves);
  const inicio = Math.max(Math.min(...chaves), fim - 11);
  return {
    yearFrom: String(Math.floor(inicio / 12)),
    monthFrom: String((inicio % 12) + 1),
    yearTo: String(Math.floor(fim / 12)),
    monthTo: String((fim % 12) + 1),
  };
}

/**
 * Aproximação de "12m" para páginas cuja FilterBar só tem ANO mas cuja série
 * é mensal (Arrecadação, ESTBAN): { anoMax-1 .. anoMax } — exatamente o range
 * que o botão "12m" da FilterBar produz (presetRange), ancorado no último ano
 * COM DADO. Início clampado no primeiro ano da série; vazia → "Tudo".
 */
export function janela12mAnos(serie, extrairAno) {
  const anos = (serie || [])
    .map(extrairAno)
    .filter((a) => a != null && !Number.isNaN(+a))
    .map(Number);
  if (!anos.length) return { ...VAZIO };
  const max = Math.max(...anos);
  const min = Math.min(...anos);
  return { yearFrom: String(Math.max(min, max - 1)), monthFrom: "", yearTo: String(max), monthTo: "" };
}

/**
 * Filtro client-side compartilhado com semântica de JANELA:
 *  - ano+mês presentes no mesmo lado → comparação composta (ano*12+mes),
 *    permitindo janelas que cruzam o ano (Ago/2023 – Jul/2024). O filtro
 *    antigo das páginas (mês como faixa independente do ano) excluía TUDO
 *    nesse caso.
 *  - só ano → comportamento atual (ano >= / <=).
 *  - só mês (sem ano) → comportamento atual (faixa de meses em todos os anos).
 * `extrair(item)` → { ano, mes } (mes opcional).
 */
export function dentroDoFiltro(item, filtro, extrair) {
  const { yearFrom = "", yearTo = "", monthFrom = "", monthTo = "" } = filtro || {};
  const p = extrair(item);
  if (!p || p.ano == null) return true;
  const ano = +p.ano;
  const mes = p.mes != null ? +p.mes : null;
  const k = mes != null ? chaveMes(ano, mes) : null;

  if (yearFrom) {
    if (monthFrom && k != null) {
      if (k < chaveMes(+yearFrom, +monthFrom)) return false;
    } else if (ano < +yearFrom) {
      return false;
    }
  }
  if (yearTo) {
    if (monthTo && k != null) {
      if (k > chaveMes(+yearTo, +monthTo)) return false;
    } else if (ano > +yearTo) {
      return false;
    }
  }
  if (!yearFrom && monthFrom && mes != null && mes < +monthFrom) return false;
  if (!yearTo && monthTo && mes != null && mes > +monthTo) return false;
  return true;
}
