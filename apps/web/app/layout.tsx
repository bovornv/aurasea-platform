import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from './contexts/language-context';
import { AlertStoreProvider } from './contexts/alert-store-context';
import { UserSessionProvider } from './contexts/user-session-context';
import { UserRoleProvider } from './contexts/user-role-context';
import { BusinessSetupProvider } from './contexts/business-setup-context';
import { TestModeProvider } from './providers/test-mode-provider';
import { OrganizationProvider } from './contexts/organization-context';
import { RouteGuard } from './components/route-guard';
import { BranchPermissionGuard } from './components/branch-permission-guard';
import { HtmlLangSetter } from './components/html-lang';
import { AppErrorBoundary } from './components/error-boundary';
import { KeyboardShortcutsProvider } from './components/keyboard-shortcuts-provider';
import { RootContentWrapper } from './components/root-content-wrapper';

const BASE_URL = 'https://auraseaos.com';

// Thai (default) SEO
const TITLE_TH = 'AuraSea OS | ระบบวิเคราะห์ธุรกิจโรงแรม ร้านอาหาร และธุรกิจจริงในไทย';
const DESC_TH =
  'AuraSea คือระบบ Operating Layer สำหรับธุรกิจจริง ช่วยเจ้าของโรงแรม ร้านอาหาร และ SME เห็นสุขภาพธุรกิจแบบเรียลไทม์ พร้อมระบบแจ้งเตือนและข้อมูลเชิงลึกอัตโนมัติ';
const TAGLINE_TH = 'ระบบ Operating Layer สำหรับธุรกิจจริงในประเทศไทย';
const TAGLINE_EN = 'The Operating Layer for the Real Economy';

// English alternate
const TITLE_EN = 'AuraSea OS | Business Intelligence for Hotels & Restaurants';
const DESC_EN =
  'AuraSea is the operating intelligence layer for hospitality and real-world businesses in Thailand.';

const KEYWORDS = [
  'ระบบวิเคราะห์ธุรกิจ',
  'ระบบโรงแรม',
  'ระบบร้านอาหาร',
  'Hospitality AI',
  'SME ไทย',
  'Dashboard ธุรกิจ',
];

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: TITLE_TH,
  description: DESC_TH,
  keywords: KEYWORDS,
  alternates: {
    canonical: BASE_URL,
    languages: {
      'th-TH': BASE_URL,
      'en-US': `${BASE_URL}/en`,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AuraSea OS',
    description: TAGLINE_TH,
    url: BASE_URL,
    siteName: 'AuraSea OS',
    locale: 'th_TH',
    type: 'website',
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'AuraSea OS',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AuraSea OS',
    description: TAGLINE_TH,
    images: [`${BASE_URL}/og-image.png`],
  },
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'AuraSea OS',
    url: BASE_URL,
    logo: `${BASE_URL}/og-image.png`,
    description: 'Operating intelligence layer for hospitality businesses in Thailand',
  };

  return (
    <html lang="th">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <AppErrorBoundary>
          <LanguageProvider>
            <HtmlLangSetter />
            <TestModeProvider>
              <UserSessionProvider>
                <OrganizationProvider>
                  <UserRoleProvider>
                    <BusinessSetupProvider>
                      <AlertStoreProvider>
                        <KeyboardShortcutsProvider>
                          <RouteGuard>
                            <BranchPermissionGuard>
                              <RootContentWrapper>
                                {children}
                              </RootContentWrapper>
                            </BranchPermissionGuard>
                          </RouteGuard>
                        </KeyboardShortcutsProvider>
                      </AlertStoreProvider>
                    </BusinessSetupProvider>
                  </UserRoleProvider>
                </OrganizationProvider>
              </UserSessionProvider>
            </TestModeProvider>
          </LanguageProvider>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
