import type { ReactNode } from "react";
import Navbar from "./Navbar";

function AppLayout({
  children,
  hideNavbar = false,
}: {
  children: ReactNode;
  hideNavbar?: boolean;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#14120B] text-[#EDECEC]">
      {!hideNavbar && <Navbar />}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export default AppLayout;
