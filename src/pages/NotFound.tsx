import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useDevices } from "@/hooks/useDevices";
import { Loader2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const { isLoading: isDevicesLoading } = useDevices();

  useEffect(() => {
    if (!isDevicesLoading) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname, isDevicesLoading]);

  if (isDevicesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
