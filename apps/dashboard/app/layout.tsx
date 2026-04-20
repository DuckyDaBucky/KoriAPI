import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kori Control Plane",
  description: "Internal operator dashboard for KoriAPI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
