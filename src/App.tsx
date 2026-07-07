import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import DevicePage from "./pages/DevicePage";
import GeneralHome from "./pages/GeneralHome";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import DeviceManagement from "./pages/DeviceManagement";
import AllDevices from "./pages/AllDevices";
import AdminDashboard from "./pages/AdminDashboard";
import Setup from "./pages/Setup";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";
import TemplateBuilder from "./pages/TemplateBuilder";
import TemplateManagement from "./pages/TemplateManagement";
import { ThemeProvider } from "@/components/ThemeProvider";
import DashboardLayout from "@/components/DashboardLayout";

const queryClient = new QueryClient();

const refreshIntervalMs = 60 * 1000; // 1 minute

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider defaultTheme="classic" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Redirect / to /home */}
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/login" element={<Login />} />

              {/* ── General Home ── */}
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <GeneralHome />
                  </ProtectedRoute>
                }
              />

              {/*
               * ── Single wildcard device route ──
               * Replaces the old "fetch-all-devices-then-generate-routes" pattern.
               * DevicePage looks up the device by path slug on demand,
               * so only the ONE requested device is ever fetched.
               */}
              <Route
                path="/device/:slug"
                element={
                  <ProtectedRoute>
                    <DevicePage pollIntervalMs={refreshIntervalMs} />
                  </ProtectedRoute>
                }
              />

              {/* ── Settings ── */}
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              {/* ── Devices browser (all users) ── */}
              <Route
                path="/devices"
                element={
                  <ProtectedRoute>
                    <AllDevices />
                  </ProtectedRoute>
                }
              />

              {/* ── Admin Only Routes ── */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/devices"
                element={
                  <ProtectedRoute adminOnly>
                    <DeviceManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute adminOnly>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/templates"
                element={
                  <ProtectedRoute adminOnly>
                    <TemplateManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/builder"
                element={
                  <ProtectedRoute adminOnly>
                    <TemplateBuilder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/help"
                element={
                  <ProtectedRoute>
                    <PlaceholderPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
