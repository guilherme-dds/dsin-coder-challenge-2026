import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { OperationsMap } from "./pages/OperationsMap";
import { Indicators } from "./pages/Indicators";
import { EquipmentList } from "./pages/EquipmentList";
import { EquipmentForm } from "./pages/EquipmentForm";
import { EquipmentSheet } from "./pages/EquipmentSheet";
import { AgentList } from "./pages/AgentList";
import { AgentForm } from "./pages/AgentForm";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OperationsMap />} />
        <Route path="indicadores" element={<Indicators />} />
        <Route path="equipamentos" element={<EquipmentList />} />
        <Route path="equipamentos/novo" element={<EquipmentForm />} />
        <Route path="equipamentos/:id" element={<EquipmentSheet />} />
        <Route path="equipamentos/:id/editar" element={<EquipmentForm />} />
        <Route path="agentes" element={<AgentList />} />
        <Route path="agentes/novo" element={<AgentForm />} />
        <Route path="agentes/:id/editar" element={<AgentForm />} />
      </Route>
    </Routes>
  );
}
