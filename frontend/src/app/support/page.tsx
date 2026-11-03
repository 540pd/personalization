"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import SupportForm from "@/support/components/SupportForm";
import { supportContext } from "@/support/supportContext";

/**
 * /support (#428): the support form as a page, for anyone -- no AuthGate, so
 * someone who cannot sign in can still write in. Reached from the sign-in
 * screen's Contact us, or by link. A page, not a dialog: no ×, and the
 * browser's Back or "Back to sign in" leaves it.
 */
export default function SupportPage() {
  return (
    <div className="support-page">
      <header className="support-page-bar">
        <span className="support-page-name">GCOS Personalization</span>
        <Link href="/" className="support-page-back">
          <ChevronLeft size={16} aria-hidden />
          Back to sign in
        </Link>
      </header>
      <main className="support-page-main">
        <SupportForm context={() => supportContext("Support page (/support)")} />
      </main>
    </div>
  );
}
