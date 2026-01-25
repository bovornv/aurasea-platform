// Custom hook for managing alert history
'use client';

import { useState, useEffect } from 'react';

export interface AlertHistoryItem {
  id: string;
  alertId: string;
  title: string;
  date: Date;
  response: 'Acknowledged' | 'Ignored';
  outcome: 'Resolved' | 'Ongoing' | 'Escalated';
}

const STORAGE_KEY = 'hospitality-ai-alert-history';

export function useAlertHistory() {
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load history from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setHistory(parsed.map((item: any) => ({
          ...item,
          date: new Date(item.date),
        })));
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addHistoryItem = (item: Omit<AlertHistoryItem, 'id' | 'date'>) => {
    const newItem: AlertHistoryItem = {
      ...item,
      id: `history-${Date.now()}`,
      date: new Date(),
    };

    const newHistory = [newItem, ...history].slice(0, 50); // Keep last 50 items
    setHistory(newHistory);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  return { history, addHistoryItem, clearHistory, loading };
}
