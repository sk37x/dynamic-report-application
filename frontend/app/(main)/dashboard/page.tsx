import type { Metadata } from "next";
import { Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

export const metadata: Metadata = {
  title: "หน้าหลัก",
};

export default function DashboardPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>หน้าหลัก</Title>
        <Text c="dimmed" mt="xs">
          พื้นที่เริ่มต้นสำหรับแอปพลิเคชันของคุณ
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper withBorder p="lg" radius="md">
          <Text fw={600}>ภาพรวม</Text>
          <Text c="dimmed" size="sm" mt="xs">
            เพิ่มข้อมูลสรุปของโครงการในส่วนนี้
          </Text>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Text fw={600}>รายการล่าสุด</Text>
          <Text c="dimmed" size="sm" mt="xs">
            ยังไม่มีรายการ
          </Text>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}