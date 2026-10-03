import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./toast";
import { ErrorBoundary } from "./ui";
import Login from "./pages/Login";

// Route-level code splitting: TipTap (editor), dashboard and profile live in
// their own chunks, keeping the initial login bundle small (LCP budget).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DocPage = lazy(() => import("./pages/Doc"));
const Profile = lazy(() => import("./pages/Profile"));
const Legal = lazy(() => import("./pages/Legal"));

function PageFallback() {
  return (
    <div className="page-loading" role="status" aria-label="Loading">
      <span className="spinner" />
    </div>
  );
}

/** Scroll to top on navigation — small thing that makes the app feel finished. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="page-loading">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public legal pages are reachable signed-out as well. */}
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/terms" element={<Legal kind="terms" />} />

        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route
          path="/profile"
          element={user ? <Profile /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/doc/:id"
          element={user ? <DocPageWithKey /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/**
 * Key the doc page by document id so navigating between documents remounts
 * the editor with the correct content (fixes stale-content on param change).
 */
function DocPageWithKey() {
  const location = useLocation();
  return <DocPage key={location.pathname} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Shell />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
