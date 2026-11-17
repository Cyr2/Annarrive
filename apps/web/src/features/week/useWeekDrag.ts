import {
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { flushSync } from "react-dom";
import type { Item, MoveOptions, Week } from "../../api/schemas.ts";
import { usePlan } from "../plan/store.ts";
import { moveOptions } from "../useLoad.ts";
import { type DropTarget, dropTargets, moveItem } from "./week.ts";

// Long press 0.3 s before the session lifts, so a tap still opens it and a swipe still scrolls.
const PRESS = { delay: 300, tolerance: 8 };

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** On release the session springs to its new slot with a small bounce (CSS `linear()` spring from the tokens). */
function dropAnimation(): DropAnimation | null {
  if (prefersReducedMotion()) return null;
  const style = getComputedStyle(document.documentElement);
  const easing = style.getPropertyValue("--ease-spring-bounce").trim();
  return {
    duration: Number.parseFloat(style.getPropertyValue("--duration-settle")) || 450,
    easing: easing || "ease-out",
  };
}

/** Drag a session in the week: lift on long press (a vibration where the phone has one), drop on an allowed day. */
export function useWeekDrag(week: Week | undefined, offset: number, today: string) {
  const [active, setActive] = useState<Item>();
  const [options, setOptions] = useState<MoveOptions>();
  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: PRESS }),
    useSensor(MouseSensor, { activationConstraint: PRESS }),
    useSensor(KeyboardSensor),
  );

  const targets: DropTarget[] = active && week ? dropTargets(active, week, today, options) : [];

  const onDragStart = ({ active: dragged }: DragStartEvent) => {
    const item = week?.items.find((i) => i.id === dragged.id);
    setActive(item);
    setOptions(undefined);
    navigator.vibrate?.(10);
    if (item?.kind === "run") moveOptions.start(item.id).promise.then(setOptions, () => undefined);
  };

  const onDragEnd = ({ over }: DragEndEvent) => {
    const item = active;
    const target = targets.find((t) => t.date === over?.id);
    setActive(undefined);
    if (item) moveOptions.forget(item.id);
    if (!item || !week || !target) return;
    const slot = { date: target.date, start: target.start };
    // Moved on screen at once, so the drop animation lands on the new slot; the server confirms after.
    flushSync(() => usePlan.setState((s) => ({ weeks: { ...s.weeks, [offset]: moveItem(week, item.id, slot) } })));
    void usePlan.getState().apply((client) => client.move(item.id, slot, item.kind === "run" ? undefined : item));
  };

  return {
    active,
    targets,
    context: { sensors, onDragStart, onDragEnd, onDragCancel: () => setActive(undefined) },
    dropAnimation: dropAnimation(),
  };
}
