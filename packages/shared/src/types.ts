export type ZoneId = 'forest' | 'lake' | 'pub';
export type EmoteId = 'heart' | 'coffee' | 'music' | 'wave' | 'zzz' | 'sparkle';
export type Facing = 'left' | 'right' | 'up' | 'down';
export type PlayerAction =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'vibe'
  | 'sleep'
  | 'celebrate';
export type PomoBadge = 'none' | 'focus' | 'break';

export interface Outfit {
  baseId: string;
  hatId: string;
  colorHex: string;
}

export interface PlayerNetState {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: ZoneId;
  facing: Facing;
  action: PlayerAction;
  outfit: Outfit;
  pomo: PomoBadge;
}

export interface ClientHelloMsg {
  t: 'hello';
  name: string;
  outfit: Outfit;
}

export interface ClientStateMsg {
  t: 'state';
  x: number;
  y: number;
  zone: ZoneId;
  facing: Facing;
  action: PlayerAction;
  pomo: PomoBadge;
}

export interface ClientEmoteMsg {
  t: 'emote';
  e: EmoteId;
}

export type ClientMessage = ClientHelloMsg | ClientStateMsg | ClientEmoteMsg;

export interface ServerWelcomeMsg {
  t: 'welcome';
  id: string;
  name?: string;
  players: PlayerNetState[];
}

export interface ServerSnapMsg {
  t: 'snap';
  players: PlayerNetState[];
  left: string[];
}

export interface ServerEmoteMsg {
  t: 'emote';
  id: string;
  e: EmoteId;
}

export interface ServerFullMsg {
  t: 'full';
}

export type ServerMessage =
  | ServerWelcomeMsg
  | ServerSnapMsg
  | ServerEmoteMsg
  | ServerFullMsg;

export type P2PPlayerMsg = Omit<PlayerNetState, 'id'>;

export interface P2PEmoteMsg {
  e: EmoteId;
}
