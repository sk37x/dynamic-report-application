import type { ReactNode } from "react";
import { MainLayout } from "../../components/layouts/main-layout";
import { AuthBoundary } from "@/features/auth/auth-boundary";

type MainRouteLayoutProps = {
  children: ReactNode;
};

export default function MainRouteLayout({
  children,
}: MainRouteLayoutProps) {
  return (
    <AuthBoundary>
      <MainLayout>{children}</MainLayout>
    </AuthBoundary>
  );
}