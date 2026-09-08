export type NavigationItem = {
  label: string;
  href: string;
};

export const navigationItems: NavigationItem[] = [
  {
    label: "หน้าหลัก",
    href: "/dashboard",
  },
  {
    label: "ตั้งค่า",
    href: "/settings",
  },
];