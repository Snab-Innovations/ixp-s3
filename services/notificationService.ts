import { rds } from './rdsApi';

export const sendNotification = async (
  recipientId: string, 
  message: string, 
  type: 'message' | 'status_update' = 'message',
  senderId?: string,
  senderName?: string
) => {
  if (!recipientId) {
    console.error("Attempted to send notification without recipientId");
    throw new Error("Recipient ID is required");
  }
  try {
    await rds.createNotification({
      userId: recipientId,
      message,
      type,
      senderId: senderId || null,
      senderName: senderName || 'System'
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
};
