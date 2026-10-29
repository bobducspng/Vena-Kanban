import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ShortcutsHelp } from "../../lib/useShortcuts";
import { Header } from "./Header";

/** App frame: sidebar + header + main content region. */
export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex h-screen bg-bg text-text">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        <ShortcutsHelp />
      </div>
    </div>
  );
}
