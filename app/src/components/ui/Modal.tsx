import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Accessible dialog on Radix: focus trap, Esc, labelled by its title. */
export function Modal({ open, onOpenChange, title, description, children, footer, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.4)]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-card-modal -translate-x-1/2 -translate-y-1/2",
            "max-h-[90vh] overflow-auto rounded-lg bg-bg shadow-pop",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div>
              <Dialog.Title className="text-lg text-text">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Fechar"
              className="rounded-md p-1 text-muted hover:bg-surface"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border p-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
