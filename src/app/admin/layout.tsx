import { AdminTabs } from "./admin-tabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <AdminTabs />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
