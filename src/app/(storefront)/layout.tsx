import { Header } from '@/components/storefront/Header';
import { Footer } from '@/components/storefront/Footer';
import { EmailVerificationBanner } from '@/components/storefront/EmailVerificationBanner';

export default function StorefrontLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <Header />
      <EmailVerificationBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
