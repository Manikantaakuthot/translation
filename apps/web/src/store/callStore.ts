import { create } from 'zustand';
import { callsApi } from '../api/client';

export interface CallHistoryItem {
  id: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  type: string;
  status: string;
  duration?: number;
  createdAt: string;
}

interface CallState {
  incomingCall: { callId: string; callerId: string; callerName: string; type: string } | null;
  activeCall: { callId: string; otherUserId: string; otherUserName: string; type: string; isInitiator: boolean } | null;
  callHistory: CallHistoryItem[];
  setIncomingCall: (call: CallState['incomingCall']) => void;
  setActiveCall: (call: CallState['activeCall']) => void;
  loadHistory: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  incomingCall: null,
  activeCall: null,
  callHistory: [],
  setIncomingCall: (call) => set({ incomingCall: call }),
  setActiveCall: (call) => set({ activeCall: call }),
  loadHistory: async () => {
    try {
      const { data } = await callsApi.history();
      set({ callHistory: Array.isArray(data) ? data : [] });
    } catch {
      set({ callHistory: [] });
    }
  },
}));
