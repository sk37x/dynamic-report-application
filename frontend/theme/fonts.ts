// frontend/theme/fonts.ts

import localFont from "next/font/local";

export const notoSans = localFont({
  src: [
    { path: "./fonts/NotoSansThai-Thin.ttf", weight: "100", style: "normal" },
    { path: "./fonts/NotoSansThai-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "./fonts/NotoSansThai-Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/NotoSansThai-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/NotoSansThai-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/NotoSansThai-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/NotoSansThai-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/NotoSansThai-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "./fonts/NotoSansThai-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-noto-sans",
  display: "swap",
  preload: false,
  fallback: ["Tahoma", "Arial", "sans-serif"],
});