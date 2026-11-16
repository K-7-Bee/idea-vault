import VaultSidebar, { VaultTopBar } from "./sidebar";

// The private workspace frame shared by every Vault page.
export default function VaultShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="vault flex min-h-screen text-foreground">
      <VaultSidebar />
      <div className="min-w-0 flex-1">
        <VaultTopBar />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
