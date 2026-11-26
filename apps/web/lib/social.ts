'use client';

import type { ChatMessageView, GroupView } from '@ludo/engine';
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

export type ChatMessage = ChatMessageView;

export interface Conversation {
  friend: Friend;
  lastMessage: ChatMessage | null;
  unread: number;
}

export interface GroupConversation {
  group: GroupView;
  lastMessage: ChatMessage | null;
  unread: number;
}

export interface SocialState {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  conversations: Conversation[];
  groups: GroupConversation[];
}

export interface ThreadResponse {
  friend: {
    /** The friend's username, or the group's `g:<id>` key. */
    username: string;
    level: number | null;
  };
  group?: GroupView;
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

export function cancelFriendRequest(username: string) {
  return api<SocialState & { message: string }>('/friends/cancel', { token: token(), body: { username } });
}

export function removeFriend(username: string) {
  return api<SocialState & { message: string }>('/friends/remove', { token: token(), body: { username } });
}

export function createGroup(name: string, members: string[]) {
  return api<SocialState & { group: GroupView }>('/groups/create', { token: token(), body: { name, members } });
}

export function addGroupMembers(group: string, members: string[]) {
  return api<SocialState>('/groups/add', { token: token(), body: { group, members } });
}

export function removeGroupMember(group: string, username: string) {
  return api<SocialState>('/groups/remove', { token: token(), body: { group, username } });
}

export function makeGroupAdmin(group: string, username: string) {
  return api<SocialState>('/groups/admin', { token: token(), body: { group, username } });
}

export function renameGroup(group: string, name: string) {
  return api<SocialState>('/groups/rename', { token: token(), body: { group, name } });
}

export function leaveGroup(group: string) {
  return api<SocialState>('/groups/leave', { token: token(), body: { group } });
}
