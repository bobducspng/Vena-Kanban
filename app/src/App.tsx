import { Routes, Route } from "react-router-dom";
import { Login } from "./screens/Login";
import { OrgHome } from "./screens/OrgHome";
import { PipeKanban } from "./screens/PipeKanban";
import { PipeSettings } from "./screens/PipeSettings";
import { DesignRoute } from "./screens/DesignRoute";
import { StubScreen } from "./screens/StubScreen";
import { RequireAuth } from "./components/app/RequireAuth";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/design" element={<DesignRoute />} />

      {/* Protected — gated by RequireAuth (redirects to /login without a session). */}
      <Route path="/" element={<RequireAuth><OrgHome /></RequireAuth>} />
      <Route path="/pipes/:pipeId" element={<RequireAuth><PipeKanban /></RequireAuth>} />
      <Route path="/pipes/:pipeId/settings" element={<RequireAuth><PipeSettings /></RequireAuth>} />

      {/* Planned screens — stubbed in this milestone (see replica/build-log.md). */}
      <Route path="/databases" element={<RequireAuth><StubScreen id="S13" title="Bancos de dados" planned={["Lista de tabelas", "Tabela de registros", "Detalhe do registro", "Campos do tipo conector"]} /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><StubScreen id="S16" title="Relatórios" planned={["Relatório de pipe (tabela + filtros)", "Relatório da empresa", "Dashboards com gráficos"]} /></RequireAuth>} />
      <Route path="/automations" element={<RequireAuth><StubScreen id="S12" title="Automações" planned={["Lista de regras", "Builder evento → condição → ação", "Aviso de uso medido"]} /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><StubScreen id="S11" title="Configurações do pipe" planned={["Editor de fases", "Builder de formulário", "Membros e permissões"]} /></RequireAuth>} />
      <Route path="*" element={<StubScreen id="404" title="Página não encontrada" planned={[]} />} />
    </Routes>
  );
}
