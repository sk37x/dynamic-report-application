import { ReactNode } from "react";
import { IconHome, IconSettings } from "@tabler/icons-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  children?: NavigationItem[];
};

export const navigationItems: NavigationItem[] = [
  {
    label: "หน้าหลัก",
    href: "/dashboard",
    icon: <IconHome size={18} />,
  },
  {
    label: "ตั้งค่า",
    href: "/settings",
    icon: <IconSettings size={18} />,
  },
];

// export const navigationItems: NavigationItem[] = [
//   {
//     label: "หน้าหลัก",
//     href: "/",
//     icon: <IconHome size={18} />,
//   },
//   {
//     label: "รายงาน",
//     icon: <IconChartBar size={18} />,
//     children: [
//       {
//         label: "รายงานยอดขาย",
//         href: "/reports/sales",
//         icon: <IconFileReport size={16} />,
//       },
//       {
//         label: "รายงานสรุป",
//         href: "/reports/summary",
//         icon: <IconListDetails size={16} />,
//       },
//     ],
//   },
//   {
//     label: "จัดการผู้ใช้งาน",
//     icon: <IconUsers size={18} />,
//     children: [
//       {
//         label: "รายชื่อผู้ใช้งาน",
//         href: "/users",
//       },
//       {
//         label: "สิทธิ์การใช้งาน",
//         href: "/users/roles",
//       },
//     ],
//   },
//   {
//     label: "ตั้งค่า",
//     href: "/settings",
//     icon: <IconSettings size={18} />,
//   },
// ];