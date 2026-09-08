"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Center, Loader, Stack, Text } from "@mantine/core";
import { appConfig } from "../../config/app.config";
import { useAuth } from "./auth-provider";

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { session, retrySession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(appConfig.routes.login);
    }
  }, [session.status, router]);

  if (
    session.status === "disabled" ||
    session.status === "authenticated"
  ) {
    return <>{children}</>;
  }

  if (session.status === "error") {
    return (
      <Center mih="100dvh" p="md">
        <Stack align="center">
          <Text fw={600}>ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ</Text>
          <Text c="dimmed" ta="center">
            {session.message}
          </Text>
          <Button onClick={retrySession}>ลองใหม่</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Center mih="100dvh">
      <Stack align="center">
        <Loader />
        <Text c="dimmed">กำลังตรวจสอบการเข้าสู่ระบบ...</Text>
      </Stack>
    </Center>
  );
}