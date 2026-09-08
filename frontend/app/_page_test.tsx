// frontend/app/page.tsx

"use client";

import {
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

export default function HomePage() {
  const { setColorScheme } = useMantineColorScheme();

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Application Template</Title>
          <Text c="dimmed" mt="xs">
            ทดสอบ theme และ components ส่วนกลาง
          </Text>
        </div>

        <Group>
          <Button variant="default" onClick={() => setColorScheme("light")}>
            Light
          </Button>

          <Button variant="default" onClick={() => setColorScheme("dark")}>
            Dark
          </Button>

          <Button variant="default" onClick={() => setColorScheme("auto")}>
            System
          </Button>
        </Group>

        <Paper withBorder p="xl" radius="md">
          <Stack>
            <Title order={2}>ตัวอย่างฟอร์ม</Title>

            <TextInput
              label="ชื่อผู้ใช้"
              placeholder="กรอกชื่อผู้ใช้"
            />

            <PasswordInput
              label="รหัสผ่าน"
              placeholder="กรอกรหัสผ่าน"
            />

            <Group>
              <Button
                onClick={() =>
                  notifications.show({
                    title: "ทดสอบสำเร็จ",
                    message: "Theme และ Notifications พร้อมใช้งาน",
                    color: "brand",
                  })
                }
              >
                ทดสอบแจ้งเตือน
              </Button>

              <Button variant="light">ปุ่มรอง</Button>
              <Button disabled>ปุ่มที่ปิดใช้งาน</Button>
            </Group>
          </Stack>

          <Stack>
            <Text fw={100}>Thin — ข้อความบางมาก</Text>
            <Text fw={300}>Light — ข้อความบาง</Text>
            <Text fw={400}>Regular — ข้อความปกติ</Text>
            <Text fw={500}>Medium — ข้อความกลาง</Text>
            <Text fw={700}>Bold — ข้อความหนา</Text>
            <Text fw={900}>Black — ข้อความหนามาก</Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}