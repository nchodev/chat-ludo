'use client';

import { api } from './api';
import { getSessionToken } from './profile';

export interface Friend {
  username: string;
  xp: number;
  wins: number;
  level: number;
  since: number;
}

export interface FriendRequest {
  username: string;
  createdAt: number;
}

export interface ChatMessage {
  id: number;
  from: string;
  to: string;
  mine: boolean;
  body: string;
  createdAt: number;
}

export interface Conversation {
  friend: Friend;
  lastMessage: ChatMessage | null;
}

export interface SocialState {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  conversations: Conversation[];
}

export interface ThreadResponse {
  friend: {
    username: string;
    level: number;
  };
  messages: ChatMessage[];
}

function token() {
  return getSessionToken();
}

export function getSocialState() {
  return api<SocialState>('/social', { token: token() });
}

export function sendFriendRequest(username: string) {
  return api<SocialState & { message: string; status: string }>('/friends/request', { token: token(), body: { username } });
}

export function respondToFriendRequest(username: string, action: 'accept' | 'decline') {
  return api<SocialState & { message: string }>('/friends/respond', { token: token(), body: { username, action } });
}

export function getThread(username: string) {
  return api<ThreadResponse>('/messages/thread', { token: token(), body: { username } });
}

export function sendMessage(username: string, message: string) {
  return api<SocialState & { message: ChatMessage }>('/messages/send', { token: token(), body: { username, message } });
}
