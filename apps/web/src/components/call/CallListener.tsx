import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { useSocket } from '../../hooks/useSocket';

/**
 * Global call event listener — must be mounted at the app level so incoming
 * calls are received regardless of which page/route the user is on.
 *
 * When the socket connects (including reconnects and first login), the server
 * automatically re-emits any pending ringing calls, so no calls are missed
 * even if the user was on the login page when the call was initiated.
 */
export default function CallListener() {
  const { accessToken } = useAuthStore();
  const { socket } = useSocket(accessToken);
  const { incomingCall, setIncomingCall, activeCall, setActiveCall } = useCallStore();

  useEffect(() => {
    if (!socket) {
      console.log('[CallListener] No socket — skipping listener setup');
      return;
    }
    console.log('[CallListener] Registering call event listeners, socket id:', socket.id, 'connected:', socket.connected);

    const onCallInitiate = (data: {
      callId: string;
      callerId: string;
      callerName: string;
      calleeId: string;
      type: string;
    }) => {
      console.log('[CallListener] >>> call:initiate received!', data);
      // Don't show incoming call if already in a call
      if (activeCall) {
        console.log('[CallListener] Ignoring — already in activeCall:', activeCall.callId);
        return;
      }
      console.log('[CallListener] Setting incoming call from', data.callerName);
      setIncomingCall({
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName,
        type: data.type,
      });
    };

    const onCallRejected = (data: { callId: string }) => {
      if (activeCall?.callId === data.callId) {
        setActiveCall(null);
      }
    };

    // Dismiss incoming call popup if the caller ends/cancels before we answer
    // NOTE: Do NOT clear activeCall here — CallScreen handles its own lifecycle
    // via its own call:ended listener. Clearing activeCall here destroys the
    // WebRTC effect dependency, causing immediate peer cleanup and auto-hangup.
    const onCallEnded = (data: { callId: string }) => {
      if (incomingCall?.callId === data.callId) {
        setIncomingCall(null);
      }
    };

    // Debug: log ALL events arriving on this socket
    const onAnyEvent = (event: string, ...args: any[]) => {
      if (event.startsWith('call:')) {
        console.log('[CallListener] Socket event:', event, args);
      }
    };
    socket.onAny(onAnyEvent);

    socket.on('call:initiate', onCallInitiate);
    socket.on('call:rejected', onCallRejected);
    socket.on('call:ended', onCallEnded);

    return () => {
      socket.offAny(onAnyEvent);
      socket.off('call:initiate', onCallInitiate);
      socket.off('call:rejected', onCallRejected);
      socket.off('call:ended', onCallEnded);
    };
  }, [socket, activeCall?.callId, incomingCall?.callId]);

  return null;
}
