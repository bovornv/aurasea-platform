// Home page - Decision feed showing alerts
'use client';

import { useEffect, useState } from 'react';
import { smeOSService } from '../services/sme-os-service';
import { translateAlertFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';
import Link from 'next/link';

export default function HomePage() {
  const [alerts, setAlerts] = useState<HospitalityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const smeOSAlerts = await smeOSService.getAlerts();
        const hospitalityAlerts = smeOSAlerts.map(translateAlertFromSMEOS);
        setAlerts(hospitalityAlerts);
      } catch (error) {
        console.error('Failed to load alerts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAlerts();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      case 'informational':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'Critical';
      case 'warning':
        return 'Warning';
      case 'informational':
        return 'Info';
      default:
        return severity;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading alerts...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Decision Feed
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Alerts and insights from SME OS
        </p>
      </header>

      <nav style={{ marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/home" style={{ fontWeight: 600 }}>Home</Link>
          <Link href="/alert" style={{ color: '#6b7280' }}>Alerts</Link>
          <Link href="/overview" style={{ color: '#6b7280' }}>Overview</Link>
          <Link href="/scenario" style={{ color: '#6b7280' }}>Scenario</Link>
          <Link href="/history" style={{ color: '#6b7280' }}>History</Link>
          <Link href="/settings" style={{ color: '#6b7280' }}>Settings</Link>
        </div>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No alerts at this time.</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {alert.title}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: getSeverityColor(alert.severity),
                        color: '#ffffff',
                        fontWeight: 500,
                      }}
                    >
                      {getSeverityLabel(alert.severity)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {alert.category}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {alert.timeHorizon}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {new Date(alert.timestamp).toLocaleDateString()}
                </span>
              </div>
              
              <p style={{ color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                {alert.message}
              </p>
              
              {alert.context && (
                <p style={{ color: '#6b7280', fontSize: '0.75rem', fontStyle: 'italic' }}>
                  {alert.context}
                </p>
              )}
              
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                Confidence: {Math.round(alert.confidence * 100)}%
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
