import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api, RequiredFieldError } from "../../data/store";
import type { CardFieldValue, DbRecord, FieldDef } from "../../data/types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

type Value = CardFieldValue["value"];
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Create (all columns at once) or edit (each value saves on its own, like a card). */
export function RecordModal({ tableId, columns, record, onClose, onCreated }: {
  tableId: string; columns: FieldDef[]; record: DbRecord | "new" | null; onClose: () => void;
  /** Called with the new record (e.g. a connection field connects it). */
  onCreated?: (r: DbRecord) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const existing = record && record !== "new" ? record : null;
  const [values, setValues] = useState<Record<string, Value>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setValues({}); setErrors({}); }, [record]);
  const { data: fresh } = useQuery({ queryKey: ["dbRecord", existing?.id], queryFn: () => api.database.record(existing!.id), enabled: !!existing });
  const current = fresh ?? existing;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["dbRecords", tableId] }); qc.invalidateQueries({ queryKey: ["dbRecord", existing?.id] }); };

  const create = useMutation({
    mutationFn: () => api.database.createRecord(tableId, Object.entries(values).map(([fieldId, value]) => ({ fieldId, value }))),
    onSuccess: (r) => { refresh(); toast("Registro criado", "success"); onCreated?.(r); onClose(); },
    onError: (err) => {
      if (err instanceof RequiredFieldError) {
        setErrors(Object.fromEntries(columns.filter((c) => err.missing.includes(c.label)).map((c) => [c.id, "Campo obrigatório"])));
      }
      toast(errMsg(err), "error");
    },
  });
  const remove = useMutation({
    mutationFn: () => api.database.removeRecord(existing!.id),
    onSuccess: () => { refresh(); toast("Registro excluído", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal open={!!record} onOpenChange={(o) => !o && onClose()} title={existing ? current?.title ?? "Registro" : "Novo registro"}
      footer={existing ? (
        <Button variant="secondary" loading={remove.isPending} onClick={() => { if (confirm(`Excluir "${existing.title}"? Não dá para desfazer.`)) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir registro
        </Button>
      ) : (
        <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => create.mutate()} loading={create.isPending}>Criar</Button></>
      )}>
      <div className="flex flex-col gap-4">
        {columns.map((c) => existing && current ? (
          <RecordValue key={c.id} recordId={existing.id} def={c} saved={current.values.find((v) => v.fieldId === c.id)?.value} onSaved={refresh} />
        ) : (
          <Field key={c.id} def={c} value={values[c.id]} error={errors[c.id]}
            onChange={(v) => { setValues((p) => ({ ...p, [c.id]: v })); setErrors((p) => ({ ...p, [c.id]: "" })); }} />
        ))}
      </div>
    </Modal>
  );
}

const IMMEDIATE = new Set(["select", "radio", "checkbox", "checklist", "date", "datetime", "time", "assignee_select"]);

/** One value of an existing record: local draft, debounced save, rollback on error. */
function RecordValue({ recordId, def, saved, onSaved }: { recordId: string; def: FieldDef; saved: Value | undefined; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setDraft(saved); }, [saved]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = useMutation({
    mutationFn: (value: Value) => api.database.updateRecordValue({ recordId, fieldId: def.id, value }),
    onSuccess: onSaved,
    onError: (e) => { setDraft(saved); toast(errMsg(e), "error"); },
  });
  return (
    <Field def={def} value={draft} onChange={(v) => {
      setDraft(v);
      clearTimeout(timer.current);
      if (IMMEDIATE.has(def.type)) save.mutate(v);
      else timer.current = setTimeout(() => save.mutate(v), 700);
    }} />
  );
}
