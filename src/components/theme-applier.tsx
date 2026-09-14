import { useEffect } from "react";
import { applyPrintMargins, DEFAULT_PRINT_MARGINS } from "@/lib/school/constants";
import { applyAppearance, mergeAppearance } from "@/lib/school/theme";
import { useWorkspace } from "@/lib/school/workspace";

export function ThemeApplier() {
  const { school, staff } = useWorkspace();
  useEffect(() => {
    applyAppearance(mergeAppearance(school.appearance, staff.appearance));
    applyPrintMargins(school.printMargins ?? DEFAULT_PRINT_MARGINS);
  }, [school.appearance, school.printMargins, staff.appearance]);
  return null;
}
