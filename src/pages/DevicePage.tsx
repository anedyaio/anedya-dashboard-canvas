/**
 * DevicePage — lazy-loads a single device by URL slug.
 *
 * Replaces the old pattern of fetching ALL devices in App.tsx to generate routes.
 * Now only 1 device is ever fetched per page visit.
 */
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Home from "./Home";
import DashboardLayout from "@/components/DashboardLayout";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecentDevices } from "@/hooks/useRecentDevices";
import type { Device } from "@/hooks/useDevices";

interface DevicePageProps {
  pollIntervalMs?: number;
}

const DevicePage: React.FC<DevicePageProps> = ({ pollIntervalMs = 60000 }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addRecentDevice, removeRecentDeviceByPath } = useRecentDevices();

  const devicePath = `/device/${slug}`;

  const { data: device, isLoading, isError } = useQuery<Device | null>({
    queryKey: ["device-by-path", devicePath],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*, dashboard_templates(schema, name)")
        .eq("path", devicePath)
        .maybeSingle();

      if (error) throw error;
      return (data as Device | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  // Register in recents on success; evict silently if device was deleted
  React.useEffect(() => {
    if (device) {
      addRecentDevice({ id: device.id, title: device.title, path: device.path });
    } else if (!isLoading && !isError && device === null) {
      removeRecentDeviceByPath(devicePath);
    }
  }, [device, isLoading, isError, devicePath, addRecentDevice, removeRecentDeviceByPath]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !device) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <WifiOff className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-lg">Device not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isError
                ? "Could not load this device. Please check your connection."
                : "This device may have been deleted or you don't have permission to view it."}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/devices")}>
            Browse All Devices
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <Home
      title={device.title}
      nodeId={device.node_id}
      pollIntervalMs={pollIntervalMs}
    />
  );
};

export default DevicePage;
