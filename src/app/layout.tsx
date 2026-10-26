import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Header, Footer } from "@/components/shared";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "QueueFair · Your turn, without the uncertainty.",
    template: "%s · QueueFair",
  },
  description:
    "A fairer campus queue. Join, follow your place, and arrive when called. Fictional campus demo.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <Header />
          <div id="content">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
