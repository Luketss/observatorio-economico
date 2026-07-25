// Props para título clicável acessível por teclado (Enter/Espaço = clique).
export function propsTituloClicavel(abrir) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: abrir,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
    },
  };
}
