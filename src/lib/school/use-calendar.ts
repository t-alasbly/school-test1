import { useMemo } from "react";
import { parseCalendar, type CalendarKind } from "./calendar";
import { mergeAppearance } from "./theme";
import { useWorkspace } from "./workspace";

export function useCalendar(): CalendarKind {
  const { school, staff } = useWorkspace();
  return useMemo(() => {
    const merged = mergeAppearance(school.appearance, staff.appearance);
    return parseCalendar(merged.calendar);
  }, [school.appearance, staff.appearance]);
}
