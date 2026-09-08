import type { ReactNode } from "react";

type PublicLayoutProps = {
  children: ReactNode;
};

export default function PublicLayout({
  children,
}: PublicLayoutProps) {
  return <main style={{ minHeight: "100dvh" }}>{children}</main>;
}