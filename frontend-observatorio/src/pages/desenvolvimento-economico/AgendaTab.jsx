import { useEffect, useState } from "react";
import api from "../../services/api";

// Aba "Agenda" da Gestão Empresarial: o trabalho do dia do gestor, montado
// pelo backend (/retencao/agenda) a partir dos sinais de risco e dos
// registros de ações, demandas, contatos e visitas. Só navega: cada item
// abre o drawer da empresa, onde tudo é editado.
const URL = "/desenvolvimento-economico/retencao/agenda";
const JANELAS = [7, 14, 30];
const ERRO = "Não foi possível carregar a agenda.";
const TIPO_CONTATO = { reuniao: "Reunião", ligacao: "Ligação", email: "E-mail", visita_tecnica: "Visita técnica", outro: "Outro" };
const STATUS_LABEL = { aberta: "Aberta", em_andamento: "Em andamento", resolvida: "Resolvida" };

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

function Bloco({ titulo, vazio, itens, children }) {
  return (
    <section aria-label={titulo} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4 space-y-2">
      <h3 className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
        {titulo}{itens.length > 0 && <span className="ml-2 text-slate-400 normal-case tracking-normal">{itens.length}</span>}
      </h3>
      {itens.length === 0 ? <p className="text-xs text-slate-400">{vazio}</p> : <ul className="space-y-1">{children}</ul>}
    </section>
  );
}

function Item({ onClick, empresa, tom, children }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left text-xs rounded-lg px-2 py-1.5 hover:bg-[var(--panel-2)] cursor-pointer truncate"
      >
        <span className="sr-only">Abrir</span>{" "}
        <span className="font-medium text-[var(--text)]">{empresa}</span>
        <span className="text-[var(--text-dim)]"> · </span>
        <span className="text-[var(--text-dim)]" style={tom ? { color: tom } : undefined}>{children}</span>
      </button>
    </li>
  );
}

export default function AgendaTab({ onAbrirEmpresa, refreshKey = 0 }) {
  const [dias, setDias] = useState(7);
  const [agenda, setAgenda] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Recarrega ao mudar a janela ou quando o pai sinaliza mudança (salvar
  // cadastro, alterações no drawer); resposta superada é ignorada.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    api.get(URL, { params: { dias } })
      .then((res) => { if (vivo) setAgenda(res.data); })
      .catch(() => { if (vivo) setErro(ERRO); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [dias, refreshKey]);

  const a = agenda;
  const k = a?.kpis;
  const listas = a ? [a.vencidas, a.proximas, a.sem_data, a.demandas, a.sem_contato, a.contatos_recentes] : [];
  const tudoVazio = Boolean(a) && listas.every((l) => (l || []).length === 0);
  const abrir = (id) => () => onAbrirEmpresa(id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-mute)]">Janela</span>
        <div className="flex" style={{ gap: 6 }} role="tablist" aria-label="Janela da agenda">
          {JANELAS.map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={dias === n}
              onClick={() => setDias(n)}
              className={`nid-tab ${dias === n ? "active" : ""}`}
            >
              {n} dias
            </button>
          ))}
        </div>
      </div>

      {erro && <p role="alert" className="text-sm" style={{ color: "var(--accent-2)" }}>{erro}</p>}
      {carregando && !erro && <p role="status" className="text-sm text-slate-400">Carregando…</p>}

      {!carregando && !erro && a && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {[
              { label: "Ações vencidas", value: k.vencidas, color: "text-red-600" },
              { label: `Próximos ${dias} dias`, value: k.proximas, color: "text-[var(--text)]" },
              { label: "Sem data", value: k.sem_data, color: "text-[var(--text)]" },
              { label: "Demandas abertas", value: k.demandas_abertas, color: "text-amber-500" },
              { label: "Sem contato 90 d+", value: k.sem_contato, color: "text-[var(--text)]" },
            ].map((x) => (
              <div key={x.label} className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wider">{x.label}</p>
                <p className={`text-2xl font-extrabold mt-1 ${x.color}`}>{x.value}</p>
              </div>
            ))}
          </div>

          {tudoVazio && (
            <p className="text-sm text-slate-400 text-center py-4">
              Nada na agenda: nenhuma ação, demanda aberta ou contato recente. Registre próximas ações e contatos no
              drawer de cada empresa.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Bloco titulo="Ações vencidas" vazio="Nenhuma ação vencida." itens={a.vencidas}>
              {a.vencidas.map((i) => (
                <Item key={`v-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)} tom="var(--accent-2)">
                  {i.proxima_acao} · venceu há {plural(i.dias, "dia", "dias")}{i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo={`Próximos ${dias} dias`} vazio={`Nada nos próximos ${dias} dias.`} itens={a.proximas}>
              {a.proximas.map((i) => (
                <Item key={`p-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.proxima_acao} · {i.dias === 0 ? "hoje" : `em ${plural(i.dias, "dia", "dias")}`} ({fmtDate(i.proxima_acao_data)}){i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Sem data marcada" vazio="Todas as ações têm data." itens={a.sem_data}>
              {a.sem_data.map((i) => (
                <Item key={`s-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.proxima_acao}{i.responsavel && ` · ${i.responsavel}`}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Demandas abertas" vazio="Nenhuma demanda aberta." itens={a.demandas}>
              {a.demandas.map((i) => (
                <Item key={`d-${i.demanda_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.descricao} · {STATUS_LABEL[i.status] || i.status} desde {fmtDate(i.status_desde)} · {plural(i.dias_em_aberto, "dia", "dias")} em aberto
                  {i.sinal_30d && (
                    <span className="ml-1 px-1.5 rounded-full text-[10px] font-medium" style={{ color: "var(--accent-4)", background: "var(--panel-2)" }}>30 d+</span>
                  )}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Sem contato há 90 dias ou mais" vazio="Todas as empresas tiveram contato nos últimos 90 dias." itens={a.sem_contato}>
              {a.sem_contato.map((i) => (
                <Item key={`c-${i.empresa_id}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {i.desde ? `desde ${fmtDate(i.desde)} · ${plural(i.dias, "dia", "dias")}` : "sem contato registrado"}
                </Item>
              ))}
            </Bloco>
            <Bloco titulo="Contatos e visitas recentes" vazio="Nenhum contato ou visita nos últimos 30 dias." itens={a.contatos_recentes}>
              {a.contatos_recentes.map((i, idx) => (
                <Item key={`r-${idx}`} empresa={i.empresa_nome} onClick={abrir(i.empresa_id)}>
                  {fmtDate(i.data)} · {i.tipo === "visita" ? "Visita" : (TIPO_CONTATO[i.subtipo] || "Contato")}{i.responsavel && ` · ${i.responsavel}`}{i.observacoes && ` — ${i.observacoes}`}
                </Item>
              ))}
            </Bloco>
          </div>
        </>
      )}
    </div>
  );
}
