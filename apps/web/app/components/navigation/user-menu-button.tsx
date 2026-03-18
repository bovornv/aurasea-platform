/**
 * User Menu Button Component
 * 
 * Displays user login name/initials with dropdown menu
 * Styled with Aurasea platform colors
 */
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUserSession } from '../../contexts/user-session-context';
import { useUserRole } from '../../contexts/user-role-context';
import { useI18n } from '../../hooks/use-i18n';

export function UserMenuButton() {
  const { email, isLoggedIn, permissions, logout } = useUserSession();
  const { role } = useUserRole();
  const router = useRouter();
  const { locale } = useI18n();
  const isSuperAdmin = role?.isSuperAdmin === true;
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Get user initials from email (session-based; do not depend on branch)
  const userInitials = useMemo(() => {
    if (!email) return 'U';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  }, [email]);

  // Get display name (email username part)
  const displayName = useMemo(() => {
    if (!email) return 'User';
    return email.split('@')[0];
  }, [email]);

  if (!mounted || !isLoggedIn) {
    return null;
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#0a0a0a',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#374151';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#0a0a0a';
        }}
      >
        {/* User Icon */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <path
            d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z"
            fill="#9ca3af"
          />
          <path
            d="M8 9C5.23858 9 3 11.2386 3 14V15C3 15.5523 3.44772 16 4 16H12C12.5523 16 13 15.5523 13 15V14C13 11.2386 10.7614 9 8 9Z"
            fill="#9ca3af"
          />
        </svg>

        {/* User Initials */}
        <span style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#ffffff',
          letterSpacing: '0.02em',
        }}>
          {userInitials}
        </span>

        {/* Dropdown Arrow */}
        <span style={{
          fontSize: '10px',
          color: '#ffffff',
          flexShrink: 0,
        }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            minWidth: '200px',
            overflow: 'hidden',
          }}
        >
          {/* User Info */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #e5e7eb',
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#0a0a0a',
              marginBottom: '0.25rem',
            }}>
              {displayName}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
            }}>
              {email}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '0.25rem',
            }}>
              {(() => {
                const effective = role?.effectiveRole ?? role?.finalRole;
                const roleLabel =
                  role?.finalRole === 'super_admin'
                    ? locale === 'th' ? 'Super Admin' : 'Super Admin'
                    : effective === 'owner'
                      ? locale === 'th' ? 'เจ้าของ' : 'Owner'
                      : effective === 'admin'
                        ? locale === 'th' ? 'แอดมิน' : 'Admin'
                        : effective === 'manager'
                          ? locale === 'th' ? 'ผู้จัดการสาขา' : 'Manager'
                          : effective === 'staff'
                            ? locale === 'th' ? 'พนักงาน' : 'Staff'
                            : effective ?? (locale === 'th' ? 'บทบาท' : 'Role');
                return locale === 'th' ? `บทบาท: ${roleLabel}` : `Role: ${roleLabel}`;
              })()}
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '0.25rem' }}>
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
                router.push('/login');
              }}
              type="button"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#0a0a0a',
                borderRadius: '6px',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {locale === 'th' ? 'ออกจากระบบ' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
