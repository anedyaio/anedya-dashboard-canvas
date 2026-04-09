import { useState, useEffect, useCallback } from "react";

interface CurrentData {
  deviceLastHeartbeat?: number;
}

export interface NodeDetails {
  nodeId: string;
  node_name: string;
  node_desc: string;
  bindingstatus: boolean;
  created: string;
  suspended: boolean;
  tags: { key: string; value: string }[];
}

interface GatewayError {
  message: string;
  timestamp: number;
}

interface UseIoTDataConfig {
  updateInterval?: number;
  nodeId: string;
  apiKey: string;
}

export const useIoTData = ({
  updateInterval = 60000,
  nodeId,
  apiKey,
}: UseIoTDataConfig) => {
  const [currentData, setCurrentData] = useState<CurrentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<string>("unknown");
  const [nodeDetails, setNodeDetails] = useState<NodeDetails | null>(null);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);
  const [gatewayError, setGatewayError] = useState<GatewayError | null>(null);

  const fetchRuntimeData = useCallback(async () => {
    setIsRefetching(true);

    try {
      let deviceLastHeartbeat = 0;

      const statusResponse = await fetch("https://api.anedya.io/v1/health/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nodes: [nodeId],
          lastContactThreshold: 180,
        }),
      });

      if (statusResponse.ok) {
        const statusJson = await statusResponse.json();
        const isOnline = statusJson?.data?.[nodeId]?.online ?? false;
        deviceLastHeartbeat = statusJson?.data?.[nodeId]?.lastHeartbeat ?? 0;
        setDeviceStatus(isOnline ? "online" : "offline");
      } else {
        setDeviceStatus("unknown");
      }

      const signalResponse = await fetch("https://api.anedya.io/v1/valuestore/getValue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: {
            scope: "node",
            id: nodeId,
          },
          key: "NetworkStrength",
        }),
      });

      if (signalResponse.ok) {
        const signalJson = await signalResponse.json();
        if (signalJson.success) {
          const parsedValue = Number(signalJson.value);
          setSignalStrength(Number.isFinite(parsedValue) ? parsedValue : null);
        } else {
          setSignalStrength(null);
        }
      } else {
        setSignalStrength(null);
      }

      const gatewayErrorResponse = await fetch("https://api.anedya.io/v1/valuestore/getValue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace: {
            scope: "node",
            id: nodeId,
          },
          key: "gateway_error",
        }),
      });

      if (gatewayErrorResponse.ok) {
        const gatewayErrorJson = await gatewayErrorResponse.json();
        if (gatewayErrorJson.success) {
          setGatewayError({
            message: String(gatewayErrorJson.value || ""),
            timestamp: Number(gatewayErrorJson.modified || 0),
          });
        } else {
          setGatewayError(null);
        }
      } else {
        setGatewayError(null);
      }

      setCurrentData({ deviceLastHeartbeat });
      setError(null);
    } catch {
      setError("Failed to fetch IoT data");
      setDeviceStatus("unknown");
      setSignalStrength(null);
      setGatewayError(null);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, [apiKey, nodeId]);

  useEffect(() => {
    setIsLoading(true);
    fetchRuntimeData();
  }, [fetchRuntimeData]);

  useEffect(() => {
    if (updateInterval <= 0) {
      return;
    }

    const interval = setInterval(fetchRuntimeData, updateInterval);
    return () => clearInterval(interval);
  }, [fetchRuntimeData, updateInterval]);

  useEffect(() => {
    const fetchNodeDetails = async () => {
      try {
        const response = await fetch("https://api.anedya.io/v1/node/details", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodes: [nodeId],
          }),
        });

        if (!response.ok) {
          return;
        }

        const nodeDetailsJson = await response.json();
        const details = nodeDetailsJson?.data?.[nodeId];

        if (!details) {
          setNodeDetails(null);
          return;
        }

        setNodeDetails({
          nodeId: details.nodeId,
          node_name: details.node_name,
          node_desc: details.node_desc || "",
          bindingstatus: details.bindingstatus,
          created: details.created,
          suspended: details.suspended,
          tags: details.tags || [],
        });
      } catch {
        setNodeDetails(null);
      }
    };

    fetchNodeDetails();
  }, [apiKey, nodeId]);

  return {
    currentData,
    isLoading,
    isRefetching,
    error,
    deviceStatus,
    nodeDetails,
    refetch: fetchRuntimeData,
    signalStrength,
    gatewayError,
  };
};
