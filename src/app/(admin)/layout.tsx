import { requireAdmin } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen">
      <div className="flex h-1">
        <div className="w-2/3 bg-navy" />
        <div className="w-1/3 bg-orange" />
      </div>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy font-heading font-bold text-white">M</span>
            <span className="leading-tight">
              <span className="block font-heading text-sm font-bold text-navy">MCCIA</span>
              <span className="block text-xs text-muted">MSME Helpline</span>
            </span>
          </div>
          <NavLinks />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
