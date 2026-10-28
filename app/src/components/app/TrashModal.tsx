import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { api } from "../../data/store";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";

/** Lixeira of a pipe: deleted cards, newest first, with restore. */
export function TrashModal({ pipeId, open, onOpenChange }: { pipeId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["trash", pipeId], queryFn: () => api.card.listTrash(pipeId), enabled: open });
  const restore = useMutation({
    mutationFn: api.card.restore,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["trash", pipeId] });
      qc.invalidateQueries({ queryKey: ["cards", pipeId] });
      toast(`Card #${c.number} restaurado`, "success");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Não foi possível restaurar", "error"),
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Lixeira" description="Cards excluídos deste pipe. Restaurar devolve o card à fase em que estava.">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" label="Carregando" /> Carregando…</div>
      ) : !data?.length ? (
        <p className="text-sm text-muted">A lixeira está vazia.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <span className="text-xs text-muted">#{c.number}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-text">{c.title}</span>
              <span className="text-xs text-muted">{new Date(c.deletedAt).toLocaleDateString("pt-BR")}</span>
              <Button size="sm" variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(c.id)}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
