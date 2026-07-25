import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

// Contexto de drag-and-drop dos kanbans. `campo` é a propriedade do item que
// as zonas representam ("estagio" ou "status"); onMove(id, novoValor) só
// dispara quando o card é solto numa zona diferente do valor atual do item.
// Sem KeyboardSensor de propósito: o caminho de teclado é o select do card.
export default function KanbanDndContext({ items, campo, onMove, renderOverlay, children }) {
  const [activeItem, setActiveItem] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function handleDragStart({ active }) {
    setActiveItem(items.find((i) => i.id === active.id) || null);
  }

  function handleDragEnd({ active, over }) {
    setActiveItem(null);
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    if (!item || item[campo] === over.id) return;
    onMove(active.id, over.id);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      {children}
      <DragOverlay>
        {activeItem ? <div className="rotate-2 shadow-2xl">{renderOverlay(activeItem)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
