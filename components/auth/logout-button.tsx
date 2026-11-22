import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start text-muted">
        <LogOut size={16} />
        Sign out
      </Button>
    </form>
  );
}
