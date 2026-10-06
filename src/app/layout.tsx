import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Predator Monitor | Local Wildlife Detection",
  description: "Local wildlife detection and threat monitoring dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
