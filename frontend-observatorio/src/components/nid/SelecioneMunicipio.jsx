// SelecioneMunicipio — bloco padrão para ADMIN_GLOBAL sem "Ver como" (UX/UI C4).
export default function SelecioneMunicipio() {
  return (
    <div
      className="mt-6 rounded-2xl p-10 text-center"
      style={{ background: "var(--panel)", border: "1px dashed var(--border-strong)" }}
    >
      <p className="text-base font-semibold text-[var(--text)]">Selecione um município</p>
      <p className="text-sm mt-1 text-[var(--text-dim)]">
        Use <b>"Ver como"</b> na administração de Municípios.
      </p>
    </div>
  );
}
