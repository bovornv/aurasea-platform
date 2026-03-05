import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'AuraSea',
  description: 'Operating layer for the real economy — ระบบปฏิบัติการธุรกิจสำหรับโรงแรมและร้านอาหาร',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
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
