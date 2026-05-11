import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import AdminPage from "./pages/AdminPage";
import AwardsPage from "./pages/AwardsPage";
import ClipsPage from "./pages/ClipsPage";
import HomePage from "./pages/HomePage";
import LadderPage from "./pages/LadderPage";
import ParticipantsPage from "./pages/ParticipantsPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/awards" element={<AwardsPage />} />
        <Route path="/clips" element={<ClipsPage />} />
        <Route path="/ladder" element={<LadderPage />} />
        <Route path="/participants" element={<ParticipantsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
