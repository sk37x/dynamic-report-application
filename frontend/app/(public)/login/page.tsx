import type { Metadata } from "next";
import {
  Container,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { redirect } from "next/navigation";
import { appConfig } from "../../../config/app.config";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
};

export default function LoginPage() {
    if (!appConfig.auth.enabled) {
    redirect(appConfig.routes.home);
  }

  return (
    <Container size={440} py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} ta="center">
            เข้าสู่ระบบ
          </Title>

          <Text c="dimmed" ta="center" mt="xs">
            Application Template
          </Text>
        </div>

        <Paper withBorder p="xl" radius="md">
          <LoginForm />
        </Paper>
      </Stack>
    </Container>
  );
}