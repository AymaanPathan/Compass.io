import type { ReactNode } from "react";
import Sidebar from "./Sidebar";


function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-black text-white">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export default AppLayout;
