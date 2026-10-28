import { useQuery } from "@tanstack/react-query";
import { api } from "../data/store";
import type { CardFieldValue, FieldDef } from "../data/types";
import { fieldStates, type FieldState } from "./conditions";

/** Visible/required state of `fields` (one phase's form) given the current values,
 *  after that phase's conditionals. Same evaluator the server uses for its gates. */
export function useFieldStates(
  pipeId: string,
  phaseId: string | undefined,
  fields: FieldDef[],
  values: Record<string, CardFieldValue["value"] | undefined>
): Map<string, FieldState> {
  const { data: conditions } = useQuery({ queryKey: ["conditions", pipeId], queryFn: () => api.condition.listByPipe(pipeId) });
  const own = (conditions ?? []).filter((c) => c.phaseId === phaseId);
  return fieldStates(fields, own, values);
}

/** The field definition as the form should show it (conditional "obrigatório" applied). */
export const withState = (def: FieldDef, s: FieldState | undefined): FieldDef =>
  s && s.required !== def.required ? { ...def, required: s.required } : def;
