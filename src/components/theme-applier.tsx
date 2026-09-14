import { useEffect } from "react";
import { applyAppearance, mergeAppearance } from "@/lib/school/theme";
import { useWorkspace } from "@/lib/school/workspace";

export function ThemeApplier() {
  const { school, staff } = useWorkspace();
  useEffect(() => {
    applyAppearance(mergeAppearance(school.appearance, staff.appearance));
  }, [school.appearance, staff.appearance]);
  return null;
}
