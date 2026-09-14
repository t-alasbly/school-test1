import { createContext, useContext } from "react";
import type { Workspace } from "./types";

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside AppGate");
  }
  return value;
}
