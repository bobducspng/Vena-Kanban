import { Routes, Route } from "react-router-dom";
import { Login } from "./screens/Login";
import { OrgHome } from "./screens/OrgHome";
import { PipeKanban } from "./screens/PipeKanban";
import { PipeSettings } from "./screens/PipeSettings";
import { Databases } from "./screens/Databases";
import { DatabaseView } from "./screens/DatabaseView";
import { PipeAutomations } from "./screens/PipeAutomations";
import { AutomationsHome } from "./screens/AutomationsHome";
import { OrgSettings } from "./screens/OrgSettings";
import { MyWork } from "./screens/MyWork";
import { PublicForm } from "./screens/PublicForm";
import { PipeList } from "./screens/PipeList";
import { PhaseFormPage, PortalPage, RequestsPage } from "./screens/PublicPages";
import { DesignRoute } from "./screens/DesignRoute";
import { StubScreen } from "./screens/StubScreen";
import { RequireAuth } from "./components/app/RequireAuth";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/design" element={<DesignRoute />} />
      <Route path="/f/:slug" element={<PublicForm />} />
      <Route path="/t/:token" element={<PhaseFormPage />} />
      <Route path="/pedidos/:token" element={<RequestsPage />} />
      <Route path="/portal" element={<PortalPage />} />

      {/* Protected — gated by RequireAuth (redirects to /login without a session). */}
      <Route path="/" element={<RequireAuth><OrgHome /></RequireAuth>} />
      <Route path="/pipes/:pipeId" element={<RequireAuth><PipeKanban /></RequireAuth>} />
      <Route path="/pipes/:pipeId/settings" element={<RequireAuth><PipeSettings /></RequireAuth>} />
      <Route path="/pipes/:pipeId/automations" element={<RequireAuth><PipeAutomations /></RequireAuth>} />
      <Route path="/pipes/:pipeId/list" element={<RequireAuth><PipeList /></RequireAuth>} />

      {/* Planned screens — stubbed in this milestone (see replica/build-log.md). */}
      <Route path="/databases" element={<RequireAuth><Databases /></RequireAuth>} />
      <Route path="/databases/:tableId" element={<RequireAuth><DatabaseView /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><StubScreen id="S16" title="Relatórios" planned={["Relatório de pipe (tabela + filtros)", "Relatório da empresa", "Dashboards com gráficos"]} /></RequireAuth>} />
      <Route path="/automations" element={<RequireAuth><AutomationsHome /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><OrgSettings /></RequireAuth>} />
      <Route path="/my-work" element={<RequireAuth><MyWork /></RequireAuth>} />
      <Route path="*" element={<StubScreen id="404" title="Página não encontrada" planned={[]} />} />
    </Routes>
  );
}
