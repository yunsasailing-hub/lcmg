import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthGuard } from "@/hooks/useRequireAuth";
import Login from "./pages/Login.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Training from "./pages/Training.tsx";
import Checklists from "./pages/Checklists.tsx";
import Recipes from "./pages/Recipes.tsx";
import Inventory from "./pages/Inventory.tsx";
import Maintenance from "./pages/Maintenance.tsx";
import SystemRepair from "./pages/SystemRepair.tsx";
import Management from "./pages/Management.tsx";
import KitchenProduction from "./pages/KitchenProduction.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/training" element={<AuthGuard><Training /></AuthGuard>} />
            <Route path="/checklists" element={<AuthGuard><Checklists /></AuthGuard>} />
            <Route path="/recipes/*" element={<AuthGuard><Recipes /></AuthGuard>} />
            <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
            <Route path="/maintenance" element={<AuthGuard><Maintenance /></AuthGuard>} />
            <Route path="/system-repair" element={<AuthGuard><SystemRepair /></AuthGuard>} />
            <Route path="/management" element={<AuthGuard><Management /></AuthGuard>} />
            <Route path="/kitchen-production" element={<AuthGuard><KitchenProduction /></AuthGuard>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
