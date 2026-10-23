import { useContext } from "react";
import { CondominiumContext } from "./CondominiumContextBase";

export function useCondominiumContext() {
  const context = useContext(CondominiumContext);

  if (!context) {
    throw new Error(
      "useCondominiumContext debe utilizarse dentro de CondominiumProvider."
    );
  }

  return context;
}