import { useState } from "react";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { Select } from "../components/ui/Select";
import { Tag } from "../components/ui/Tag";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";

const LABELS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"];

/** The design-system check page (replica-design Step 4). Primitives in isolation. */
export function DesignRoute() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [sel, setSel] = useState<string>();

  return (
    <AppShell title="Design system">
      <div className="mx-auto flex max-w-content flex-col gap-10 p-6">
        <Section title="Botões">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Carregando</Button>
            <Button disabled>Desabilitado</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Campos">
          <div className="grid max-w-md gap-4">
            <Input placeholder="Input de texto" />
            <Input placeholder="Input inválido" invalid />
            <Textarea placeholder="Textarea" />
            <Select value={sel} onValueChange={setSel} options={[
              { value: "a", label: "Opção A" }, { value: "b", label: "Opção B" }, { value: "c", label: "Opção C" },
            ]} />
          </div>
        </Section>

        <Section title="Tags & avatares">
          <div className="flex flex-wrap items-center gap-2">
            {LABELS.map((c) => <Tag key={c} color={c}>{c}</Tag>)}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Avatar name="Ana Souza" color="blue" />
            <Avatar name="Bruno Lima" color="green" />
            <Avatar name="Carla Dias" color="purple" size="sm" />
          </div>
        </Section>

        <Section title="Overlays">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(true)}>Abrir modal</Button>
            <Button variant="secondary" onClick={() => toast("Tudo certo!", "success")}>Toast sucesso</Button>
            <Button variant="secondary" onClick={() => toast("Algo deu errado", "error")}>Toast erro</Button>
          </div>
        </Section>
      </div>

      <Modal open={modal} onOpenChange={setModal} title="Modal de exemplo" description="Com foco preso e fechável por Esc."
        footer={<Button onClick={() => setModal(false)}>Fechar</Button>}>
        <p className="text-sm text-text">Conteúdo do modal.</p>
      </Modal>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg text-text">{title}</h2>
      {children}
    </section>
  );
}
