import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'

import { AuthProvider, AuthGuard } from '@/auth/auth'

import ThemeProvider from '@/components/providers/ThemeProvider'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import TopHeader from '@/components/layout/TopHeader'
import FAB from '@/components/layout/FAB'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner'
import { Loader2 } from 'lucide-react'

import Landing from '@/pages/Landing'
import Auth from '@/pages/Auth'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import Accounts from '@/pages/Accounts'
import Transactions from '@/pages/Transactions'
import Budgets from '@/pages/Budgets'
import Categories from '@/pages/Categories'
import NotFound from '@/pages/NotFound'

// Lazy-loaded routes — these pages use recharts (~400 KB) or are rarely visited.
// Splitting them reduces the initial JS bundle significantly.
const Reports = lazy(() => import('@/pages/Reports'))
const Investments = lazy(() => import('@/pages/Investments'))
const Settings = lazy(() => import('@/pages/Settings'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <GlobalErrorBanner />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <TopHeader />
        <main className="flex-1 pb-20 md:pb-0">
          <div className="container mx-auto p-4 md:p-6 max-w-[1400px]">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      <MobileNav />
      <FAB />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route
              path="/reset-password"
              element={<Navigate to="/auth/reset-password" replace />}
            />
            <Route
              path="/app"
              element={
                <AuthGuard>
                  <AppLayout />
                </AuthGuard>
              }
            >
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
              <Route path="/accounts" element={<Navigate to="/app/accounts" replace />} />
              <Route path="/transactions" element={<Navigate to="/app/transactions" replace />} />
              <Route path="/budgets" element={<Navigate to="/app/budgets" replace />} />
              <Route path="/reports" element={<Navigate to="/app/reports" replace />} />
              <Route path="/categories" element={<Navigate to="/app/categories" replace />} />
              <Route path="/investments" element={<Navigate to="/app/investments" replace />} />
              <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="reports" element={<Reports />} />
              <Route path="categories" element={<Categories />} />
              <Route path="investments" element={<Investments />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
