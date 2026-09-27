import { useSyncExternalStore } from "react";
import type { NoteTarget } from "@/components/note-actions";

type GroupPickState = {
  picking: boolean;
  targets: NoteTarget[];
};

const empty: GroupPickState = { picking: false, targets: [] };
let state: GroupPickState = empty;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: GroupPickState) {
  state = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGroupPick() {
  return useSyncExternalStore(subscribe, () => state, () => empty);
}

export function setGroupPicking(picking: boolean) {
  setState(picking ? { picking: true, targets: state.targets } : empty);
}

export function toggleGroupStudent(target: NoteTarget) {
  const exists = state.targets.some((item) => item.studentId === target.studentId);
  setState({
    picking: true,
    targets: exists
      ? state.targets.filter((item) => item.studentId !== target.studentId)
      : [...state.targets, target],
  });
}

export function addGroupStudents(targets: NoteTarget[]) {
  const map = new Map(state.targets.map((item) => [item.studentId, item]));
  for (const target of targets) map.set(target.studentId, target);
  setState({ picking: true, targets: [...map.values()] });
}

export function clearGroupStudents() {
  setState({ picking: state.picking, targets: [] });
}

export function finishGroupPick(failedIds: number[]) {
  if (failedIds.length === 0) {
    setState(empty);
    return;
  }
  const failed = new Set(failedIds);
  setState({
    picking: true,
    targets: state.targets.filter((item) => failed.has(item.studentId)),
  });
}

export function elsewhereLabel(targets: NoteTarget[], visibleIds: Set<number>) {
  const others = targets.filter((item) => !visibleIds.has(item.studentId));
  if (others.length === 0) return "";
  const names = others
    .slice(0, 3)
    .map((item) => item.studentName)
    .join("، ");
  const more = others.length > 3 ? ` و${others.length - 3}` : "";
  return `محفوظ من مراحل أو فصول أخرى (${others.length}): ${names}${more}`;
}
