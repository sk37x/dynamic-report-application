import type { Metadata } from "next";
import { Paper, Stack, Text, Title } from "@mantine/core";

export const metadata: Metadata = {
  title: "ตั้งค่า",
};

export default function SettingsPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>ตั้งค่า</Title>
        <Text c="dimmed" mt="xs">
          จัดการการตั้งค่าของแอปพลิเคชัน
        </Text>
      </div>

      <Paper withBorder p="lg" radius="md">
        <Text>ยังไม่มีรายการตั้งค่า</Text>
      </Paper>
    </Stack>
  );
}