import { useLayoutEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import ChatSidebar from '../components/chat/ChatSidebar';
import { useChatStore } from '../store/chatStore';

export default function Chats() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedConversationId = useChatStore((s) => s.selectedConversationId);
  // On mobile, hide sidebar when viewing a chat, settings, or other pages
  const isOnSubPage = location.pathname !== '/' && location.pathname !== '';

  // WhatsApp-like behavior: when you open/refresh "/",
  // automatically restore the last opened chat.
  useLayoutEffect(() => {
    if (location.pathname !== '/') return;
    if (!selectedConversationId) return;
    navigate(`/chat/${selectedConversationId}`, { replace: true });
  }, [location.pathname, selectedConversationId, navigate]);

  return (
    <div className="flex h-screen bg-[#F0F2F5] dark:bg-[#111B21]">
      {/* Sidebar: always visible on desktop, hidden on mobile when viewing sub-pages */}
      <div className={`${isOnSubPage ? 'hidden md:flex' : 'flex'} flex-col`}>
        <ChatSidebar />
      </div>
      {/* Main content: always visible on desktop, full width on mobile */}
      <main className={`flex-1 flex flex-col min-w-0 ${!isOnSubPage ? 'hidden md:flex' : 'flex'}`}>
        <Outlet />
      </main>
    </div>
  );
}
