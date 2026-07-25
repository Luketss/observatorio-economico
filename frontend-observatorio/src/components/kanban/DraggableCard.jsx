import { useDraggable } from "@dnd-kit/core";

// Torna o card arrastável. Não espalha `attributes` do useDraggable de
// propósito: sem KeyboardSensor, role/tabIndex criariam um alvo de foco
// que não faz nada (o título dentro do card tem o próprio role="button").
export default function DraggableCard({ id, disabled = false, children }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{ touchAction: "manipulation" }}
      className={disabled ? undefined : `cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}
