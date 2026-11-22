import { BriefcaseBusiness, FolderKanban, Home, PenLine, Settings } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/create", label: "Create", icon: PenLine },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/business", label: "Business", icon: BriefcaseBusiness },
];

export const settingsItem = { href: "/settings", label: "Settings", icon: Settings };
