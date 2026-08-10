// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MunicipioPicker from "./MunicipioPicker";

const MUNICIPIOS = [
  { id: 1, nome: "Bom Jesus", estado: "PI", codigo_ibge: "2201901" },
  { id: 2, nome: "Bom Despacho", estado: "MG", codigo_ibge: "3107703" },
  { id: 3, nome: "Uberlândia", estado: "MG", codigo_ibge: "3170206" },
];

afterEach(cleanup);

function montar(props = {}) {
  const onChange = vi.fn();
  render(<MunicipioPicker municipios={MUNICIPIOS} value="" onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
}

const abrir = async (user) => {
  await user.click(screen.getByRole("button", { name: /selecionar município/i }));
  // O input aberto tem role="combobox" explícito (ARIA 1.2 combobox pattern —
  // ver correção de acessibilidade), o que sobrepõe o role implícito
  // "textbox" de <input type="text">; por isso a busca é por "combobox".
  return screen.getByRole("combobox");
};

describe("MunicipioPicker", () => {
  // Este teste NÃO reproduz o bug real: no Chromium, digitar espaço com o
  // input focado dentro de um <button> dispara também um click sintético
  // (detail=0) no botão ancestral — foi reproduzido fora do jsdom com
  // Playwright, ver .superpowers/sdd/2026-08-09-comparativo-pares-e-picker/repro.html.
  // O jsdom + @testing-library/user-event não emula esse borbulhamento
  // nativo (só simula clique quando o próprio alvo do evento é clicável),
  // então ele passa mesmo com o bug presente. Ele fica como guarda de
  // comportamento de digitação (espaço não deve limpar/fechar por conta
  // da lógica do componente); quem realmente prova o bug e a correção é o
  // teste de aninhamento logo abaixo.
  it("barra de espaco escreve na busca e NAO fecha a lista", async () => {
    const { user } = montar();
    const input = await abrir(user);

    await user.type(input, "bom ");

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(input.value).toBe("bom ");
    expect(screen.getAllByRole("option").length).toBe(2);
  });

  it("nenhum controle interativo fica aninhado em button, aberto ou fechado", async () => {
    const { user } = montar({ value: "3" });
    const semAninhamento = () =>
      [...document.querySelectorAll("button")].forEach((b) => {
        expect(b.querySelector("input, button, select, a, textarea")).toBeNull();
      });

    semAninhamento();            // fechado: o "limpar" não pode estar dentro do gatilho
    await abrir(user);
    semAninhamento();            // aberto: o campo de busca não pode estar dentro de button
  });

  it("setas movem o destaque e Enter escolhe", async () => {
    const { user, onChange } = montar();
    const input = await abrir(user);

    await user.type(input, "bom");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2");   // Bom Despacho
  });

  it("Escape fecha a lista", async () => {
    const { user } = montar();
    const input = await abrir(user);
    await user.type(input, "{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("limpar dispara onChange vazio sem reabrir a lista", async () => {
    const { user, onChange } = montar({ value: "3" });
    await user.click(screen.getByRole("button", { name: /limpar seleção/i }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicar no chevron com a lista fechada tambem abre o seletor", async () => {
    montar();
    // O botao do chevron é aria-hidden (duplica no mouse a ação que o
    // "__campo" já oferece ao teclado/leitor de tela), então não aparece em
    // getByRole — precisa ser localizado via seletor CSS mesmo.
    const chevronBtn = document.querySelector(".nid-municipio-picker__chevron-btn");
    expect(chevronBtn).toBeTruthy();

    await userEvent.setup().click(chevronBtn);

    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("aria-activedescendant mora no elemento com foco (o input) e aponta pro item destacado", async () => {
    const { user } = montar();
    const input = await abrir(user);

    await user.type(input, "bom");
    await user.keyboard("{ArrowDown}");

    // Leitor de tela só anuncia aria-activedescendant quando ele está no
    // elemento que TEM o foco — por isso a amarração precisa ser: foco no
    // input, atributo NELE (não num ancestral), apontando pra <li> real.
    expect(document.activeElement).toBe(input);
    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const opcaoDestacada = document.getElementById(activeId);
    expect(opcaoDestacada).toBeTruthy();
    expect(opcaoDestacada.className).toContain("is-active");
  });
});
