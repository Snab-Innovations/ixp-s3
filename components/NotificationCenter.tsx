import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { rds, poll } from '../services/rdsApi';
import { loadStoredCognitoSession } from '../services/authService';
import { sendNotification } from '../services/notificationService';
import { useMessageBox } from './MessageBox';

interface Notification {
  id: string;
  message: string;
  type: 'message' | 'status_update';
  read: boolean;
  createdAt: any;
  senderName?: string;
  senderId?: string;
}

interface NotificationCenterProps {
  label?: string;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ label }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reply Modal State
  const [replyState, setReplyState] = useState<{ isOpen: boolean; recipientId: string; recipientName: string }>({ isOpen: false, recipientId: '', recipientName: '' });
  const [replyMessage, setReplyMessage] = useState('');
  const user = loadStoredCognitoSession();
  const userUid = user?.firebaseUid;
  const messageBox = useMessageBox();

  useEffect(() => {
    if (!userUid) return;

    const stop = poll(() => rds.listNotifications(), ({ notifications }) => {
      const notifs = (notifications || []).map(n => ({
        id: n.id,
        ...n
      } as Notification));

      notifs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    }, (err) => console.error("Error fetching notifications:", err), 8000);

    return () => stop();
  }, [userUid]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      await rds.updateNotification(notificationId, { read: true });
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    unread.forEach(n => markAsRead(n.id));
  };

  const handleReplyClick = (e: React.MouseEvent, notif: Notification) => {
    e.stopPropagation(); // Prevent triggering markAsRead immediately if desired, or let it bubble
    if (notif.senderId) {
      setReplyState({ isOpen: true, recipientId: notif.senderId, recipientName: notif.senderName || 'Recruiter' });
      setShowDropdown(false); // Close dropdown
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !userUid) return;
    try {
      await sendNotification(replyState.recipientId, replyMessage, 'message', userUid, user?.email || 'Candidate');
      messageBox.showSuccess('Reply sent!');
      setReplyState({ isOpen: false, recipientId: '', recipientName: '' });
      setReplyMessage('');
    } catch (error) {
      messageBox.showError('Failed to send reply.');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 dark:text-slate-400 hover:text-primary transition-colors focus:outline-none flex items-center gap-2"
      >
        {label && <span className="text-sm font-medium hidden md:block">{label}</span>}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl border border-gray-100 dark:border-slate-800 z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-black/80 backdrop-blur-sm">
            <h3 className="font-semibold text-gray-700 dark:text-slate-200">Chats & Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-slate-400 text-sm">No notifications yet</div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`p-3 border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                  onClick={() => markAsRead(notif.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${!notif.read ? 'bg-primary' : 'bg-transparent'}`} />
                    <div>
                      {notif.senderName && (
                        <p className="text-xs font-bold text-gray-600 dark:text-slate-300 mb-0.5">{notif.senderName}</p>
                      )}
                      <p className="text-sm text-gray-800 dark:text-slate-200">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">
                          {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString() : 'Just now'}
                        </p>
                        {notif.type === 'message' && notif.senderId && (
                          <button
                            onClick={(e) => handleReplyClick(e, notif)}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Reply
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {replyState.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4">
          <div className="bg-white dark:bg-black/80 backdrop-blur-sm rounded-lg shadow-xl w-full max-w-md p-4 animate-in fade-in zoom-in duration-200">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4">Reply to {replyState.recipientName}</h3>
            <textarea
              className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary mb-4 min-h-[100px] bg-white dark:bg-slate-950 dark:text-white dark:placeholder-slate-500"
              placeholder="Type your reply..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReplyState({ ...replyState, isOpen: false })}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
              >
                Cancel
              </button>
              <button onClick={sendReply} className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary-dark">
                Send Reply
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('portal-root') || document.body
      )}
    </div>
  );
};

export default NotificationCenter;