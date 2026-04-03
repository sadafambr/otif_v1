import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glass-surface glass-surface-ring rounded-2xl px-10 py-12 text-center shadow-lg transition-shadow duration-300">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">Oops! Page not found</p>
        <a
          href="/"
          className="inline-flex text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-200 hover:text-primary/90 hover:decoration-primary"
        >
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
