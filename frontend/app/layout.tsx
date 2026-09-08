// frontend/app/layout.tsx

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { AppProviders } from "../providers/app-providers";
import "./globals.css";
import { notoSans } from "@/theme/fonts";

export const metadata: Metadata = {
  title: {
    default: "Application Template",
    template: "%s | Application Template",
  },
  description: "Next.js and NestJS application template",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="th"
      {...mantineHtmlProps}
      className={`${notoSans.variable}`}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>

      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}