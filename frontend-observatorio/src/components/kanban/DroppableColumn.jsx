import { useDroppable } from "@dnd-kit/core";

// Zona de soltar de um estágio/status. `id` é o valor que a zona representa.
export default function DroppableColumn({ id, disabled = false, className = "", style, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl transition-colors ${isOver ? "ring-2 ring-blue-500/60 bg-blue-500/5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
