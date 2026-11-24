export interface BaseRoomConfig {
  appId: string;
  password?: string;
  rtcConfig?: RTCConfiguration;
}

export type RoomAction<T = any> = (data: T, targetPeerId?: string) => Promise<any> | void;
export type ActionReceiver<T = any> = (
  callback: (data: T, peerId: string, metadata?: any) => void
) => void;

export interface Room {
  makeAction: <T = any>(actionName: string) => [RoomAction<T>, ActionReceiver<T>];
  onPeerJoin: (cb: (peerId: string) => void) => void;
  onPeerLeave: (cb: (peerId: string) => void) => void;
  getPeers: () => Record<string, any>;
  leaveRoom: () => void;
}

/**
 * Serverless P2P room via Trystero.
 * Uses BroadcastChannel on localhost/browser tabs as an offline-resilient implementation,
 * allowing multiple tabs/windows to discover each other, verify passwords, and communicate.
 */
export function joinRoom(config: BaseRoomConfig, roomId: string): Room {
  const localPeerId = 'peer_' + Math.random().toString(36).slice(2, 9);
  const channelName = `trystero-${config.appId}-${roomId}`;

  const peerJoinCbs = new Set<(peerId: string) => void>();
  const peerLeaveCbs = new Set<(peerId: string) => void>();
  const actionReceivers = new Map<
    string,
    Set<(data: any, peerId: string, metadata?: any) => void>
  >();

  const peers = new Map<string, { lastSeen: number }>();
  let isClosed = false;

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(channelName);
  }

  const broadcastMsg = (msg: any) => {
    if (isClosed || !channel) return;
    try {
      channel.postMessage(msg);
    } catch (e) {
      // ignore
    }
  };

  const handleMessage = (event: MessageEvent) => {
    if (isClosed) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.senderPeerId === localPeerId) return;

    // Check password if room has a password configured or received
    if (config.password && msg.password !== config.password) {
      return; // wrong password, ignore
    }
    if (!config.password && msg.password) {
      return; // expected open room, received password
    }

    const senderId = msg.senderPeerId;
    if (!senderId) return;

    if (msg.type === 'hello') {
      const isNew = !peers.has(senderId);
      peers.set(senderId, { lastSeen: Date.now() });
      // Reply with welcome
      broadcastMsg({
        type: 'welcome',
        senderPeerId: localPeerId,
        targetPeerId: senderId,
        password: config.password,
      });
      if (isNew) {
        for (const cb of peerJoinCbs) {
          cb(senderId);
        }
      }
    } else if (msg.type === 'welcome') {
      if (msg.targetPeerId === localPeerId) {
        const isNew = !peers.has(senderId);
        peers.set(senderId, { lastSeen: Date.now() });
        if (isNew) {
          for (const cb of peerJoinCbs) {
            cb(senderId);
          }
        }
      }
    } else if (msg.type === 'ping') {
      peers.set(senderId, { lastSeen: Date.now() });
    } else if (msg.type === 'leave') {
      if (peers.has(senderId)) {
        peers.delete(senderId);
        for (const cb of peerLeaveCbs) {
          cb(senderId);
        }
      }
    } else if (msg.type === 'action') {
      if (!msg.targetPeerId || msg.targetPeerId === localPeerId) {
        peers.set(senderId, { lastSeen: Date.now() });
        const receivers = actionReceivers.get(msg.actionName);
        if (receivers) {
          for (const cb of receivers) {
            cb(msg.data, senderId);
          }
        }
      }
    }
  };

  if (channel) {
    channel.onmessage = handleMessage;
    // Announce join
    broadcastMsg({
      type: 'hello',
      senderPeerId: localPeerId,
      password: config.password,
    });
  }

  // Heartbeat ping & dead peer cleanup
  let pingInterval: any = null;
  if (typeof setInterval !== 'undefined') {
    pingInterval = setInterval(() => {
      if (isClosed) return;
      broadcastMsg({
        type: 'ping',
        senderPeerId: localPeerId,
        password: config.password,
      });

      const now = Date.now();
      for (const [pId, info] of Array.from(peers.entries())) {
        if (now - info.lastSeen > 8000) {
          peers.delete(pId);
          for (const cb of peerLeaveCbs) {
            cb(pId);
          }
        }
      }
    }, 2000);
  }

  const room: Room = {
    makeAction: <T = any>(actionName: string): [RoomAction<T>, ActionReceiver<T>] => {
      if (!actionReceivers.has(actionName)) {
        actionReceivers.set(actionName, new Set());
      }
      const receivers = actionReceivers.get(actionName)!;

      const send: RoomAction<T> = (data: T, targetPeerId?: string) => {
        broadcastMsg({
          type: 'action',
          actionName,
          data,
          targetPeerId,
          senderPeerId: localPeerId,
          password: config.password,
        });
      };

      const onReceive: ActionReceiver<T> = (cb) => {
        receivers.add(cb);
      };

      return [send, onReceive];
    },

    onPeerJoin: (cb: (peerId: string) => void) => {
      peerJoinCbs.add(cb);
    },

    onPeerLeave: (cb: (peerId: string) => void) => {
      peerLeaveCbs.add(cb);
    },

    getPeers: () => {
      const record: Record<string, any> = {};
      for (const pId of peers.keys()) {
        record[pId] = {};
      }
      return record;
    },

    leaveRoom: () => {
      if (isClosed) return;
      isClosed = true;
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      broadcastMsg({
        type: 'leave',
        senderPeerId: localPeerId,
        password: config.password,
      });
      peers.clear();
      peerJoinCbs.clear();
      peerLeaveCbs.clear();
      actionReceivers.clear();
      if (channel) {
        channel.close();
        channel = null;
      }
    },
  };

  return room;
}
