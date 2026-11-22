import Link from "next/link";
import { Sparkles, UserCircle } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { navItems, settingsItem } from "./nav-items";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r border-border bg-white px-4 py-5 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-3 text-lg font-semibold text-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white"><Sparkles size={18} /></span>
          BeautyContent
        </Link>
        <nav className="mt-10 flex flex-1 flex-col gap-1" aria-label="Main navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-control px-3 py-3 text-sm font-medium text-muted hover:bg-accent-light hover:text-primary-dark">
              <Icon size={18} />{label}
            </Link>
          ))}
          <Link href={settingsItem.href} className="mt-auto flex items-center gap-3 rounded-control px-3 py-3 text-sm font-medium text-muted hover:bg-accent-light hover:text-primary-dark">
            <settingsItem.icon size={18} />{settingsItem.label}
          </Link>
        </nav>
        <div className="mt-5 border-t border-border px-2 pt-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <UserCircle size={28} /><span>Workspace</span>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <div className="lg:pl-[232px]">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-4 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold"><Sparkles className="text-primary" size={20} />BeautyContent</Link>
          <UserCircle className="text-muted" size={24} />
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-white py-2 lg:hidden" aria-label="Mobile navigation">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1 py-1 text-[11px] text-muted hover:text-primary">
            <Icon size={19} />{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
