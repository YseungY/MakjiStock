import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bread Market | MAKJI",
  description: "시장 데이터로 매일 달라지는 MAKJI의 오늘의 빵 할인",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
