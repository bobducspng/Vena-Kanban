import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, RequiredFieldError } from "../../data/store";
import type { CardFieldValue } from "../../data/types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Field } from "../ui/Field";
import { useToast } from "../ui/Toast";

/** S07 — start form: create a card. Required fields gate submission. */
export function StartFormModal({ pipeId, phaseId, open, onOpenChange }: { pipeId: string; phaseId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, CardFieldValue["value"]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const startPhase = phases?.find((p) => p.isStart);
  const { data: fields } = useQuery({
    queryKey: ["fields", startPhase?.id],
    queryFn: () => api.field.listByPhase(startPhase!.id),
    enabled: !!startPhase,
  });

  const reset = () => { setTitle(""); setValues({}); setErrors({}); };

  const create = useMutation({
    mutationFn: () =>
      api.card.create({
        pipeId,
        phaseId,
        title,
        values: Object.entries(values).map(([fieldId, value]) => ({ fieldId, value })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards", pipeId] });
      toast("Card criado", "success");
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof RequiredFieldError && fields) {
        const map: Record<string, string> = {};
        fields.forEach((f) => { if (err.missing.includes(f.label)) map[f.id] = "Campo obrigatório"; });
        setErrors(map);
        toast(err.message, "error");
      } else {
        toast("Não foi possível criar o card", "error");
      }
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Novo card"
      description="Preencha o formulário inicial do processo."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending}>Criar card</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="card-title" className="text-sm font-medium text-text">Título do card</label>
          <Input id="card-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo em uma linha" />
        </div>
        {fields?.map((f) => (
          <Field
            key={f.id}
            def={f}
            value={values[f.id]}
            error={errors[f.id]}
            onChange={(v) => { setValues((p) => ({ ...p, [f.id]: v })); setErrors((p) => ({ ...p, [f.id]: "" })); }}
          />
        ))}
      </form>
    </Modal>
  );
}
