"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { appConfig } from "../../config/app.config";
import { getErrorMessage } from "../../lib/api/api-error";
import { useAuth } from "./auth-provider";

export function LoginForm() {
  const { session, login, retrySession } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldRedirect =
    session.status === "authenticated" ||
    session.status === "disabled";

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(appConfig.routes.home);
    }
  }, [shouldRedirect, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login({
        username: normalizedUsername,
        password,
      });

      // เมื่อ session เปลี่ยนเป็น authenticated
      // effect ด้านบนจะพาไปหน้าแรก
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (session.status === "loading" || shouldRedirect) {
    return (
      <Stack align="center">
        <Loader />
        <Text c="dimmed">กำลังตรวจสอบการเข้าสู่ระบบ...</Text>
      </Stack>
    );
  }

  if (session.status === "error") {
    return (
      <Stack>
        <Alert color="red" title="ตรวจสอบ session ไม่สำเร็จ">
          {session.message}
        </Alert>
        <Button variant="light" onClick={retrySession}>
          ลองใหม่
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        {error && (
          <Alert color="red" title="เข้าสู่ระบบไม่สำเร็จ">
            {error}
          </Alert>
        )}

        <TextInput
          label="ชื่อผู้ใช้"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          disabled={submitting}
          required
        />

        <PasswordInput
          label="รหัสผ่าน"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          disabled={submitting}
          required
        />

        <Button type="submit" fullWidth loading={submitting}>
          เข้าสู่ระบบ
        </Button>
      </Stack>
    </form>
  );
}