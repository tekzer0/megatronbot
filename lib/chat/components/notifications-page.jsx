'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { BellIcon } from './icons.js';
import { getNotifications, markNotificationsRead } from '../actions.js';

function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function NotificationsPage({ session }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getNotifications();
        setNotifications(result);
        // Mark all as read on view
        await markNotificationsRead();
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground mb-4">
        {notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}
      </p>

      {/* Notification list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No notifications yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-3 py-3">
              <div className="mt-0.5 shrink-0 text-muted-foreground">
                <BellIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap">{n.notification}</p>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
