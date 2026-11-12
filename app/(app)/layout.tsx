import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-64 print:pl-0">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
