"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Container,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { navigationItems } from "../../config/navigation";
import { IconChevronDown, IconLogout, IconMoon, IconSettings, IconSun, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/features/auth/auth-provider";

type MenuShellProps = {
  children: ReactNode;
};

type ShellUser = {
  name: string;
  email?: string;
  role?: string;
};


export function MenuShell({ children }: MenuShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [opened, { toggle, close }] = useDisclosure(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { logout } = useAuth();

  const user: ShellUser = {
    name: "Administrator",
    email: "admin@example.com",
    role: "ผู้ดูแลระบบ",
  };

  const handleLogout = async () => {
    await logout();
    // router.replace("/login");
  };
  
  const isDark = colorScheme === "dark";

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={opened ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"}
              aria-expanded={opened}
              aria-controls="main-navigation"
            />

            <Text fw={700} size="lg" lineClamp={1}>
              Application Template
            </Text>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={() => toggleColorScheme()}
              aria-label="สลับธีม"
            >
              {isDark ? (
                <IconSun size={20} />
              ) : (
                <IconMoon size={20} />
              )}
            </ActionIcon>

            <Menu
              shadow="md"
              width={240}
              position="bottom-end"
              offset={10}
              withArrow
            >
              <Menu.Target>
                <UnstyledButton
                  aria-label="เปิดเมนูผู้ใช้งาน"
                  style={{
                    padding: "5px 8px",
                    borderRadius: "var(--mantine-radius-md)",
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Avatar
                      size={34}
                      radius="xl"
                      color="blue"
                      name={user.name}
                    />

                    <Box visibleFrom="sm">
                      <Text size="sm" fw={600} lineClamp={1}>
                        {user.name}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {user.role}
                      </Text>
                    </Box>

                    <IconChevronDown
                      size={14}
                      style={{ opacity: 0.6 }}
                    />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Box px="sm" py="xs">
                  <Text size="sm" fw={600}>
                    {user.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {user.email}
                  </Text>
                </Box>

                <Menu.Divider />

                <Menu.Item
                  leftSection={<IconUser size={16} />}
                  onClick={() => router.push("/profile")}
                >
                  ข้อมูลส่วนตัว
                </Menu.Item>

                <Menu.Item
                  leftSection={<IconSettings size={16} />}
                  onClick={() => router.push("/settings")}
                >
                  ตั้งค่าบัญชี
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={handleLogout}
                >
                  ออกจากระบบ
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" id="main-navigation">
        <AppShell.Section grow component={ScrollArea}>
          <nav aria-label="เมนูหลัก">
            <Stack gap="xs">
              {navigationItems.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <NavLink
                    key={item.href}
                    component={Link}
                    href={item.href}
                    label={item.label}
                    active={active}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                    variant="light"
                    style={{ borderRadius: "var(--mantine-radius-md)" }}
                  />
                );
              })}
            </Stack>
          </nav>
        </AppShell.Section>

        <AppShell.Section pt="md">
          <Text size="xs" c="dimmed">
            Application Template · v0.1.0
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size="xl" px={0}>
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}