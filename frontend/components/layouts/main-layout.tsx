import type { ReactNode } from "react";
import { appConfig } from "../../config/app.config";
import { MenuShell } from "./menu-shell";

type MainLayoutProps = {
  children: ReactNode;
};

export function MainLayout({ children }: MainLayoutProps) {
  if (appConfig.layout.variant === "plain") {
    return (
      <main style={{ minHeight: "100dvh" }}>
        {children}
      </main>
    );
  }

  return <MenuShell>{children}</MenuShell>;
}