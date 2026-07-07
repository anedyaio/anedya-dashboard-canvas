import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Settings,
  LogOut,
  Wifi,
  Users,
  LayoutDashboard,
  Home as HomeIcon,
  Shield,
  Server,
  LayoutTemplate,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useRecentDevices } from '@/hooks/useRecentDevices';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin, user } = useAuth();

  // ⚡ No API call — purely from localStorage. Instant, scales to any fleet size.
  const { recentDevices } = useRecentDevices();

  const handleNavigation = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
  };

  const settingsMenuItem = { icon: Settings, label: 'Settings', path: '/settings', show: true };

  const adminMenuItems = [
    { icon: Shield, label: 'Admin Dashboard', path: '/admin', show: isAdmin },
    { icon: Server, label: 'Device Management', path: '/admin/devices', show: isAdmin },
    { icon: Users, label: 'User Management', path: '/users', show: isAdmin },
    { icon: LayoutTemplate, label: 'Dashboard Canvas', path: '/admin/templates', show: isAdmin },
  ].filter(item => item.show);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / App header */}
      <div className="flex items-center gap-3 px-2 py-4 border-b border-border">
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <img
            src="/favicon.png"
            alt="Logo"
            className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]"
          />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold truncate">
            {import.meta.env.VITE_APP_NAME || 'Anedya Dashboard Canvas'}
          </h2>
          <p
            className="text-xs text-muted-foreground truncate"
            title={user?.email || 'User'}
          >
            {user?.email || 'User'}
            {isAdmin && <span className="ml-1 text-primary">(Admin)</span>}
          </p>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="space-y-1 px-2">

          {/* Home */}
          <Button
            variant={location.pathname === '/home' || location.pathname === '/' ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-3 h-11',
              (location.pathname === '/home' || location.pathname === '/') &&
              'bg-primary/10 text-primary hover:bg-primary/15'
            )}
            onClick={() => handleNavigation('/home')}
          >
            <HomeIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">Home</span>
          </Button>

          {/* ── Devices section ── */}
          <div className="pt-4 pb-1 px-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Devices
            </h3>
          </div>

          {/* Last 5 recently accessed devices — loaded from localStorage, zero API cost */}
          {recentDevices.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-1.5">
              No recently viewed devices.
            </p>
          ) : (
            <div className="space-y-0.5">
              {recentDevices.map((device) => {
                const isActive = location.pathname === device.path;
                return (
                  <Button
                    key={device.id}
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-2.5 h-9 pl-6 text-sm',
                      isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
                    )}
                    onClick={() => handleNavigation(device.path)}
                    title={device.title}
                  >
                    <Wifi className="h-[15px] w-[15px] shrink-0 opacity-70" />
                    <span className="truncate">{device.title}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* View All Devices → */}
          <Button
            variant={location.pathname === '/devices' ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-between gap-2 h-9 pl-6 text-sm',
              location.pathname === '/devices' &&
              'bg-primary/10 text-primary hover:bg-primary/15'
            )}
            onClick={() => handleNavigation('/devices')}
          >
            <span className="text-muted-foreground group-hover:text-foreground">
              View All Devices
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>

        </div>

        <div className="my-4 border-t border-border" />

        {/* Settings */}
        <div className="space-y-1 px-2">
          <Button
            variant={location.pathname === settingsMenuItem.path ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-3 h-11',
              location.pathname === settingsMenuItem.path &&
              'bg-primary/10 text-primary hover:bg-primary/15'
            )}
            onClick={() => handleNavigation(settingsMenuItem.path)}
          >
            <settingsMenuItem.icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{settingsMenuItem.label}</span>
          </Button>
        </div>

        {/* Admin section */}
        {adminMenuItems.length > 0 && (
          <>
            <div className="my-4 border-t border-border" />
            <div className="pt-1 pb-1 px-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Admin
              </h3>
            </div>
            <div className="space-y-1 px-2">
              {adminMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start gap-3 h-11',
                      isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
                    )}
                    onClick={() => handleNavigation(item.path)}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sheet */}
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card">
        <SidebarContent />
      </aside>
    </>
  );
};

export default Sidebar;
