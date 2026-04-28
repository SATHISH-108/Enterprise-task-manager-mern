import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../store/authStore.js";
import Spinner from "../../shared/components/Spinner.jsx";

export default function RequireAuth({ allowedRoles, children }) {
  const { user, status, bootstrap } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === "idle") bootstrap();
  }, [status, bootstrap]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
