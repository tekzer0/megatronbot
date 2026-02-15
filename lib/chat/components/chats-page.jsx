'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { MessageIcon, TrashIcon, SearchIcon, PlusIcon } from './icons.js';
import { getChats, deleteChat } from '../actions.js';
import { cn } from '../utils.js';

function groupChatsByDate(chats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7Days = new Date(today.getTime() - 7 * 86400000);
  const last30Days = new Date(today.getTime() - 30 * 86400000);

  const groups = {
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
    Older: [],
  };

  for (const chat of chats) {
    const date = new Date(chat.updatedAt);
    if (date >= today) {
      groups.Today.push(chat);
    } else if (date >= yesterday) {
      groups.Yesterday.push(chat);
    } else if (date >= last7Days) {
      groups['Last 7 Days'].push(chat);
    } else if (date >= last30Days) {
      groups['Last 30 Days'].push(chat);
    } else {
      groups.Older.push(chat);
    }
  }

  return groups;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
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

export function ChatsPage({ session }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const navigateToChat = (id) => {
    window.location.href = id ? `/chat/${id}` : '/';
  };

  const loadChats = async () => {
    try {
      const result = await getChats();
      setChats(result);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    const handler = () => loadChats();
    window.addEventListener('chatsupdated', handler);
    return () => window.removeEventListener('chatsupdated', handler);
  }, []);

  const handleDelete = async (chatId) => {
    const { success } = await deleteChat(chatId);
    if (success) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    }
  };

  const filtered = query
    ? chats.filter((c) => c.title?.toLowerCase().includes(query.toLowerCase()))
    : chats;

  const grouped = groupChatsByDate(filtered);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Chats</h1>
        <button
          onClick={() => navigateToChat(null)}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90"
        >
          <PlusIcon size={14} />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search your chats..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          <SearchIcon size={16} />
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground mb-4">
        {filtered.length} {filtered.length === 1 ? 'chat' : 'chats'}
      </p>

      {/* Chat list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {query ? 'No chats match your search.' : 'No chats yet. Start a conversation!'}
        </p>
      ) : (
        <div className="flex flex-col">
          {Object.entries(grouped).map(([label, groupChats]) =>
            groupChats.length > 0 ? (
              <div key={label} className="mb-4">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {label}
                </h2>
                <div className="flex flex-col divide-y divide-border">
                  {groupChats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      onNavigate={navigateToChat}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </PageLayout>
  );
}

function ChatRow({ chat, onNavigate, onDelete }) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className="relative group flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/50 rounded-md"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      onClick={() => onNavigate(chat.id)}
    >
      <MessageIcon size={16} />
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">{chat.title || 'New Chat'}</span>
        <span className="text-xs text-muted-foreground">
          Last message {timeAgo(chat.updatedAt)}
        </span>
      </div>
      {showDelete && (
        <button
          className={cn(
            'shrink-0 rounded-md p-1.5',
            'text-muted-foreground hover:text-destructive hover:bg-muted'
          )}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(chat.id);
          }}
          aria-label="Delete chat"
        >
          <TrashIcon size={14} />
        </button>
      )}
    </div>
  );
}
