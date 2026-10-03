import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./toast";
import { ErrorBoundary } from "./ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DocPage from "./pages/Doc";
import Profile from "./pages/Profile";

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
    <Routes>
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
