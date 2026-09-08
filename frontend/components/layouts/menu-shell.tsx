"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppShell,
  Burger,
  Button,
  Container,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { navigationItems } from "../../config/navigation";

type MenuShellProps = {
  children: ReactNode;
};

export function MenuShell({ children }: MenuShellProps) {
  const pathname = usePathname();
  const [opened, { toggle, close }] = useDisclosure(false);
  const { toggleColorScheme } = useMantineColorScheme();

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

          <Button
            variant="default"
            size="xs"
            onClick={() => toggleColorScheme()}
          >
            สลับธีม
          </Button>
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