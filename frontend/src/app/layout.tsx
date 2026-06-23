import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Result UGC Chat",
  description: "Generate short UGC videos from product URLs"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
