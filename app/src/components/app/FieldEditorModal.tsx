import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../data/store";
import { EDITABLE_FIELD_TYPES, OPTION_FIELD_TYPES, UNIQUE_FIELD_TYPES, type ConnectionSettings, type EditableFieldType, type FieldDef } from "../../data/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** What the editor produces; the caller decides where it is saved (phase field or database column). */
export interface FieldDraft {
  label: string;
  type: EditableFieldType;
  required: boolean;
  options: string[] | null;
  description: string | null;
  help: string | null;
  editableOtherPhases: boolean;
  isUnique: boolean;
  validationRegex: string | null;
  settings: ConnectionSettings | null; // connection fields
}

/** Create or edit one field. The type is chosen on creation and cannot change afterwards. */
export function FieldEditorModal({ field, onClose, onSaved, save: persist, types = EDITABLE_FIELD_TYPES, phaseOptions = true, noun = "campo" }: {
  field: FieldDef | "new" | null;
  onClose: () => void;
  onSaved: () => void;
  save: (draft: FieldDraft, existing: FieldDef | null) => Promise<unknown>;
  types?: readonly { value: string; label: string }[];
  phaseOptions?: boolean; // show "editável em outras fases" (phase fields only)
  noun?: "campo" | "coluna";
}) {
  const toast = useToast();
  const existing = field && field !== "new" ? field : null;
  const [label, setLabel] = useState("");
  const [type, setType] = useState<EditableFieldType>("short_text");
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [description, setDescription] = useState("");
  const [help, setHelp] = useState("");
  const [editableOtherPhases, setEditableOtherPhases] = useState(true);
  const [isUnique, setIsUnique] = useState(false);
  const [regex, setRegex] = useState("");
  const [conn, setConn] = useState<ConnectionSettings>({ target: "table", targetId: "", canSearch: true, canCreate: true, multiple: false });
  const isConnection = type === "connection";
  const { data: tables } = useQuery({ queryKey: ["databases"], queryFn: api.database.list, enabled: isConnection });
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list, enabled: isConnection });

  useEffect(() => {
    setLabel(existing?.label ?? "");
    setType((existing?.type as EditableFieldType) ?? "short_text");
    setRequired(existing?.required ?? false);
    setOptionsText((existing?.options ?? []).join("\n"));
    setDescription(existing?.description ?? "");
    setHelp(existing?.help ?? "");
    setEditableOtherPhases(existing?.editableOtherPhases ?? true);
    setIsUnique(existing?.isUnique ?? false);
    setRegex(existing?.validationRegex ?? "");
    setConn(existing?.settings ?? { target: "table", targetId: "", canSearch: true, canCreate: true, multiple: false });
  }, [field]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasOptions = OPTION_FIELD_TYPES.includes(type);
  const canBeUnique = UNIQUE_FIELD_TYPES.includes(type);
  const canRegex = type === "short_text";
  const options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
  const regexError = (() => { if (!regex) return ""; try { new RegExp(regex); return ""; } catch { return "Expressão inválida"; } })();

  const props = {
    description: description.trim() || null,
    help: help.trim() || null,
    editableOtherPhases,
    isUnique: canBeUnique && isUnique,
    validationRegex: canRegex && regex ? regex : null,
    settings: isConnection ? conn : null,
  };
  const save = useMutation({
    mutationFn: () => persist({ label: label.trim(), type, required, options: hasOptions ? options : null, ...props }, existing),
    onSuccess: () => { onSaved(); toast(existing ? "Salvo" : `${noun === "campo" ? "Campo criado" : "Coluna criada"}`, "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      open={!!field}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Editar ${noun}` : `${noun === "campo" ? "Novo campo" : "Nova coluna"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!label.trim() || (hasOptions && options.length === 0) || !!regexError || (isConnection && (!conn.targetId || (!conn.canSearch && !conn.canCreate)))}>Salvar</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-label" className="text-sm font-medium text-text">Nome do campo</label>
          <Input id="field-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Valor do pedido" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-type" className="text-sm font-medium text-text">Tipo</label>
          <Select id="field-type" value={type} disabled={!!existing} onValueChange={(v) => setType(v as EditableFieldType)} options={types.map((t) => ({ value: t.value, label: t.label }))} />
          {existing && <p className="text-xs text-muted">O tipo não pode ser alterado depois de criado. Para mudar, crie um campo novo.</p>}
        </div>
        {isConnection && (
          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium text-text">Conexão</legend>
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Select aria-label="Conectar com" value={conn.target} disabled={!!existing}
                onValueChange={(v) => setConn((c) => ({ ...c, target: v as "table" | "pipe", targetId: "" }))}
                options={[{ value: "table", label: "Database" }, { value: "pipe", label: "Pipe" }]} />
              <Select aria-label={conn.target === "table" ? "Database" : "Pipe"} value={conn.targetId || undefined} disabled={!!existing}
                placeholder={conn.target === "table" ? "Escolha o database" : "Escolha o pipe"}
                onValueChange={(v) => setConn((c) => ({ ...c, targetId: v }))}
                options={(conn.target === "table" ? tables ?? [] : pipes ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            </div>
            {existing && <p className="text-xs text-muted">O destino não muda depois de criado (as conexões já feitas apontam para ele).</p>}
            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={conn.canSearch} onChange={(e) => setConn((c) => ({ ...c, canSearch: e.target.checked }))} />
              Buscar itens existentes
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={conn.canCreate} onChange={(e) => setConn((c) => ({ ...c, canCreate: e.target.checked }))} />
              Criar novos {conn.target === "table" ? "registros" : "cards"} a partir do card
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={conn.multiple} onChange={(e) => setConn((c) => ({ ...c, multiple: e.target.checked }))} />
              Permitir vários itens
            </label>
          </fieldset>
        )}
        {hasOptions && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="field-options" className="text-sm font-medium text-text">Opções (uma por linha)</label>
            <Textarea id="field-options" rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={"Baixa\nMédia\nAlta"} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-description" className="text-sm font-medium text-text">Descrição <span className="text-muted">(opcional, aparece abaixo do nome)</span></label>
          <Textarea id="field-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-help" className="text-sm font-medium text-text">Texto de ajuda <span className="text-muted">(opcional, dica para quem preenche)</span></label>
          <Input id="field-help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Ex.: informe o valor com impostos" />
        </div>
        {canRegex && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="field-regex" className="text-sm font-medium text-text">Validação por expressão regular <span className="text-muted">(opcional)</span></label>
            <Input id="field-regex" value={regex} invalid={!!regexError} onChange={(e) => setRegex(e.target.value)} placeholder="Ex.: ^[A-Z]{3}-\d{4}$" className="font-mono" />
            {regexError && <p className="text-xs text-danger">{regexError}</p>}
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Regras do campo</legend>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            {phaseOptions ? "Obrigatório (o card não sai desta fase sem ele)" : "Obrigatório"}
          </label>
          {phaseOptions && (
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={editableOtherPhases} onChange={(e) => setEditableOtherPhases(e.target.checked)} />
            Editável em outras fases (depois que o card sair desta fase)
          </label>
          )}
          {canBeUnique && (
            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={isUnique} onChange={(e) => setIsUnique(e.target.checked)} />
              {phaseOptions ? "Valor único (não deixa repetir o valor de outro card do pipe)" : "Valor único (não deixa repetir o valor de outro registro)"}
            </label>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
