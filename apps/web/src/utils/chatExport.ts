import { format } from 'date-fns';
import type { Message } from '../store/chatStore';

/**
 * Export chat messages as a text file download
 */
export function exportChatAsText(
  messages: Message[],
  chatName: string,
  participants?: { userId: string; name?: string }[]
): void {
  const participantMap = new Map(
    (participants || []).map((p) => [p.userId, p.name || 'Unknown'])
  );

  let content = `Chat Export: ${chatName}\n`;
  content += `Exported on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n`;
  content += `Total messages: ${messages.length}\n`;
  content += '─'.repeat(50) + '\n\n';

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let lastDate = '';

  for (const msg of sorted) {
    const msgDate = format(new Date(msg.createdAt), 'dd/MM/yyyy');
    if (msgDate !== lastDate) {
      content += `\n── ${msgDate} ──\n\n`;
      lastDate = msgDate;
    }

    const time = format(new Date(msg.createdAt), 'HH:mm');
    const sender = msg.senderName || participantMap.get(msg.senderId) || msg.senderId;

    if (msg.isDeleted) {
      content += `[${time}] ${sender}: <This message was deleted>\n`;
      continue;
    }

    let messageText = '';
    switch (msg.type) {
      case 'text':
        messageText = msg.content || '';
        break;
      case 'image':
        messageText = `[Image] ${msg.content || msg.mediaUrl || ''}`;
        break;
      case 'video':
        messageText = `[Video] ${msg.content || msg.mediaUrl || ''}`;
        break;
      case 'voice':
      case 'audio':
        messageText = '[Voice message]';
        break;
      case 'document':
        messageText = `[Document] ${msg.content || ''}`;
        break;
      case 'contact':
        try {
          const contact = JSON.parse(msg.content || '{}');
          messageText = `[Contact] ${contact.name || 'Unknown'} - ${contact.phone || ''}`;
        } catch {
          messageText = '[Contact]';
        }
        break;
      case 'poll':
        if (msg.poll) {
          messageText = `[Poll] ${msg.poll.question}\n`;
          msg.poll.options.forEach((opt, i) => {
            messageText += `  ${i + 1}. ${opt.text} (${opt.voters?.length || 0} votes)\n`;
          });
        }
        break;
      case 'location':
        if (msg.location) {
          messageText = `[Location] ${msg.location.name || ''} ${msg.location.address || ''} (${msg.location.latitude}, ${msg.location.longitude})`;
        }
        break;
      default:
        messageText = msg.content || `[${msg.type}]`;
    }

    if (msg.replyToMessage) {
      content += `[${time}] ${sender}: (reply to: "${msg.replyToMessage.content?.slice(0, 40)}...")\n`;
    }

    content += `[${time}] ${sender}: ${messageText}\n`;
  }

  content += '\n' + '─'.repeat(50) + '\n';
  content += `End of export\n`;

  // Trigger download
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${chatName.replace(/[^a-zA-Z0-9]/g, '_')}-${format(new Date(), 'yyyyMMdd')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export chat as JSON (for backup/analysis)
 */
export function exportChatAsJson(messages: Message[], chatName: string): void {
  const data = {
    chatName,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.senderName || m.senderId,
      type: m.type,
      content: m.content,
      mediaUrl: m.mediaUrl,
      createdAt: m.createdAt,
      reactions: m.reactions,
      poll: m.poll,
      location: m.location,
      isDeleted: m.isDeleted,
      isEdited: m.isEdited,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${chatName.replace(/[^a-zA-Z0-9]/g, '_')}-${format(new Date(), 'yyyyMMdd')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
