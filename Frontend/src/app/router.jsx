import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "../shared/components/Navbar.jsx";
import Login from "../features/auth/Login.jsx";
import Register from "../features/auth/Register.jsx";
import ForgotPassword from "../features/auth/ForgotPassword.jsx";
import ResetPassword from "../features/auth/ResetPassword.jsx";
import RequireAuth from "../features/auth/RequireAuth.jsx";
import UserDashboard from "../features/dashboard/UserDashboard.jsx";
import AdminDashboard from "../features/dashboard/AdminDashboard.jsx";
import TeamsPage from "../features/teams/TeamsPage.jsx";
import TeamDetailPage from "../features/teams/TeamDetailPage.jsx";
import ProjectsPage from "../features/projects/ProjectsPage.jsx";
import ProjectBoardPage from "../features/projects/ProjectBoardPage.jsx";
import AssistantWidget from "../features/ai/AssistantWidget.jsx";
import TaskRedirect from "../features/kanban/TaskRedirect.jsx";
import AllTasksPage from "../features/tasks/AllTasksPage.jsx";
import RoadmapPage from "../features/roadmap/RoadmapPage.jsx";
import WorkspacesPage from "../features/workspaces/WorkspacesPage.jsx";
import WorkspaceDetailPage from "../features/workspaces/WorkspaceDetailPage.jsx";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        {/* public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* authed */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <UserDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/teams"
          element={
            <RequireAuth>
              <TeamsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/teams/:id"
          element={
            <RequireAuth>
              <TeamDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/teams/:id/roadmap"
          element={
            <RequireAuth>
              <RoadmapPage />
            </RequireAuth>
          }
        />
        <Route
          path="/workspaces"
          element={
            <RequireAuth>
              <WorkspacesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/workspaces/:id"
          element={
            <RequireAuth>
              <WorkspaceDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <RequireAuth>
              <ProjectBoardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth allowedRoles={["admin"]}>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/tasks"
          element={
            <RequireAuth>
              <AllTasksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <RequireAuth>
              <TaskRedirect />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AssistantWidget />
    </BrowserRouter>
  );
}
