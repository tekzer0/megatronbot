'use client';

import { useState, useEffect } from 'react';
import { SquarePenIcon, PanelLeftIcon, MessageIcon, BellIcon, SwarmIcon, ClockIcon, ZapIcon } from './icons.js';
import { getUnreadNotificationCount } from '../actions.js';
import { SidebarHistory } from './sidebar-history.js';
import { SidebarUserNav } from './sidebar-user-nav.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from './ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import { useChatNav } from './chat-nav-context.js';

export function AppSidebar({ user }) {
  const { navigateToChat } = useChatNav();
  const { state, open, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getUnreadNotificationCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
  }, []);

  return (
    <Sidebar>
      <SidebarHeader>
        {/* Top row: brand name + toggle icon (open) or just toggle icon (collapsed) */}
        <div className={collapsed ? 'flex justify-center' : 'flex items-center justify-between'}>
          {!collapsed && (
            <span className="px-2 font-semibold text-lg">The Pope Bot</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={toggleSidebar}
              >
                <PanelLeftIcon size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? 'right' : 'bottom'}>
              {collapsed ? 'Open sidebar' : 'Close sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        <SidebarMenu>
          {/* New chat */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    navigateToChat(null);
                    setOpenMobile(false);
                  }}
                >
                  <SquarePenIcon size={16} />
                  {!collapsed && <span>New chat</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">New chat</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Chats history */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/chats';
                  }}
                >
                  <MessageIcon size={16} />
                  {!collapsed && <span>Chats</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Chats</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Notifications */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/notifications';
                  }}
                >
                  <BellIcon size={16} />
                  {!collapsed && (
                    <span className="flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                          {unreadCount}
                        </span>
                      )}
                    </span>
                  )}
                  {collapsed && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                      {unreadCount}
                    </span>
                  )}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Notifications</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Swarm */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/swarm';
                  }}
                >
                  <SwarmIcon size={16} />
                  {!collapsed && <span>Swarm</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Swarm</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Cron Jobs */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/crons';
                  }}
                >
                  <ClockIcon size={16} />
                  {!collapsed && <span>Cron Jobs</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Cron Jobs</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Triggers */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/triggers';
                  }}
                >
                  <ZapIcon size={16} />
                  {!collapsed && <span>Triggers</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Triggers</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarHeader>

      {!collapsed && (
        <SidebarContent>
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
          </SidebarGroup>
          <SidebarHistory />
        </SidebarContent>
      )}

      {/* Spacer when collapsed to push footer down */}
      {collapsed && <div className="flex-1" />}

      <SidebarFooter>
        {user && <SidebarUserNav user={user} collapsed={collapsed} />}
      </SidebarFooter>
    </Sidebar>
  );
}
