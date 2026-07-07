import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Device } from "./useDevices";

export interface DevicesPage {
  devices: Device[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface UseDevicesPaginatedOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

/**
 * Server-side paginated + searchable device list.
 * Never fetches more than `pageSize` records at a time.
 * Safe for 10k–100k+ devices.
 */
export function useDevicesPaginated({
  page = 1,
  pageSize = 50,
  search = "",
}: UseDevicesPaginatedOptions = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return useQuery<DevicesPage>({
    queryKey: ["devices-paginated", page, pageSize, search],
    queryFn: async () => {
      let query = supabase
        .from("devices")
        .select("*, dashboard_templates(schema, name)", { count: "exact" })
        .order("title", { ascending: true })
        .range(from, to);

      if (search.trim()) {
        // Search by title or node_id – server-side filter
        query = query.or(
          `title.ilike.%${search.trim()}%,node_id.ilike.%${search.trim()}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count ?? 0;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));

      return {
        devices: (data ?? []) as Device[],
        total,
        page,
        pageSize,
        pageCount,
      };
    },
    placeholderData: (prev) => prev, // keep previous page visible while new page loads
    staleTime: 30_000, // 30 s – don't re-fetch on every focus
  });
}
