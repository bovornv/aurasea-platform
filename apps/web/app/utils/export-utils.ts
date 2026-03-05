// Export utilities for data export functionality
'use client';

import type { OperationalSignal } from '../services/operational-signals-service';
import type { HospitalityAlert } from '../adapters/hospitality-adapter';

/**
 * Export operational signals to CSV
 */
export function exportSignalsToCSV(signals: OperationalSignal[]): void {
  if (signals.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = [
    'Timestamp',
    'Cash Balance (THB)',
    'Revenue 7 Days (THB)',
    'Revenue 30 Days (THB)',
    'Costs 7 Days (THB)',
    'Costs 30 Days (THB)',
    'Staff Count',
    'Occupancy Rate (%)',
    'Customer Volume'
  ];

  const rows = signals.map(signal => [
    signal.timestamp.toISOString(),
    signal.cashBalance.toString(),
    signal.revenue7Days.toString(),
    signal.revenue30Days.toString(),
    signal.costs7Days.toString(),
    signal.costs30Days.toString(),
    signal.staffCount.toString(),
    signal.occupancyRate !== undefined ? (signal.occupancyRate * 100).toFixed(1) : '',
    signal.customerVolume !== undefined ? signal.customerVolume.toString() : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  downloadCSV(csvContent, `operational-signals-${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export alerts to CSV
 */
export function exportAlertsToCSV(alerts: HospitalityAlert[]): void {
  if (alerts.length === 0) {
    alert('No alerts to export');
    return;
  }

  const headers = [
    'ID',
    'Timestamp',
    'Type',
    'Severity',
    'Category',
    'Title',
    'Message',
    'Confidence (%)',
    'Time Horizon'
  ];

  const rows = alerts.map(alert => [
    alert.id,
    alert.timestamp.toISOString(),
    (alert as any).type || 'risk',
    alert.severity,
    alert.category,
    alert.title,
    alert.message.replace(/,/g, ';'), // Replace commas in message
    Math.round(alert.confidence * 100).toString(),
    alert.timeHorizon
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  downloadCSV(csvContent, `alerts-${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Download CSV file
 */
function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
