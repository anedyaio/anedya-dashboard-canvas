import React, { useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Wifi,
  Loader2,
  LayoutTemplate,
  ExternalLink,
  ServerOff,
} from "lucide-react";
import { useDevicesPaginated } from "@/hooks/useDevicesPaginated";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import type { Device } from "@/hooks/useDevices";
import { useRecentDevices } from "@/hooks/useRecentDevices";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const columnHelper = createColumnHelper<Device>();

const AllDevices: React.FC = () => {
  const navigate = useNavigate();
  const { addRecentDevice } = useRecentDevices();

  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Debounce search so we don't fire a query on every keystroke
  const search = useDebounce(searchInput, 350);

  // Reset to page 1 whenever search changes
  React.useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, isFetching, isError } = useDevicesPaginated({
    page,
    pageSize,
    search,
  });

  const handleOpenDevice = useCallback(
    (device: Device) => {
      addRecentDevice({ id: device.id, title: device.title, path: device.path });
      navigate(device.path);
    },
    [navigate, addRecentDevice]
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "icon",
        header: "",
        cell: () => (
          <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
        ),
        size: 36,
      }),
      columnHelper.accessor("title", {
        header: "Device Name",
        cell: (info) => (
          <span className="font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("node_id", {
        header: "Device ID",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("dashboard_templates", {
        header: "Template",
        cell: (info) => {
          const t = info.getValue();
          return t ? (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 gap-1 font-normal bg-primary/5"
            >
              <LayoutTemplate className="h-3 w-3" />
              {t.name}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 gap-1 font-normal text-muted-foreground"
            >
              <LayoutTemplate className="h-3 w-3" />
              Default
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleOpenDevice(row.original)}
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </Button>
        ),
        size: 80,
      }),
    ],
    [handleOpenDevice]
  );

  const table = useReactTable({
    data: data?.devices ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.pageCount ?? 1,
  });

  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">All Devices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total > 0
                ? `${total.toLocaleString()} device${total !== 1 ? "s" : ""} total`
                : "Browse your connected devices"}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or Device ID…"
              className="pl-9 h-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* Table card */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Loading overlay */}
          <div className="relative">
            {isFetching && !isLoading && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/30 z-10">
                <div className="h-full bg-primary animate-[shimmer_1s_ease-in-out_infinite] w-1/3" />
              </div>
            )}

            <Table>
              <TableHeader className="bg-muted/60">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-muted/60 border-border">
                    {hg.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.column.columnDef.size }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  // Skeleton rows
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><div className="h-4 w-4 rounded bg-muted animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 w-36 rounded bg-muted animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 w-64 rounded bg-muted animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 w-20 rounded bg-muted animate-pulse" /></TableCell>
                      <TableCell><div className="h-4 w-12 rounded bg-muted animate-pulse" /></TableCell>
                    </TableRow>
                  ))
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <ServerOff className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          Failed to load devices. Please try again.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setPage(1)}>
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <Wifi className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          {search
                            ? `No devices found matching "${search}"`
                            : "No devices available."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => handleOpenDevice(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border bg-muted/30">
            {/* Rows per page */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page:</span>
              <div className="flex gap-1">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <Button
                    key={size}
                    size="sm"
                    variant={pageSize === size ? "secondary" : "ghost"}
                    className="h-7 w-10 text-xs"
                    onClick={() => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            {/* Page info + nav */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {total === 0 ? "0 results" : `${from}–${to} of ${total.toLocaleString()}`}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || isFetching}
                  title="First page"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  title="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                <span className="px-2 text-sm tabular-nums">
                  {page} / {pageCount}
                </span>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount || isFetching}
                  title="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage(pageCount)}
                  disabled={page >= pageCount || isFetching}
                  title="Last page"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AllDevices;
