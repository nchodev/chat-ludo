import { describe, expect, it } from 'vitest';
import { chatPreviewText, describeGroupEvent, groupKey, parseChatImage, parseGroupEvent, parseGroupKey } from './protocol';

describe('photos in the chat', () => {
  it('reads the size and caption of a photo message', () => {
    expect(parseChatImage('{"width":1600,"height":1200,"caption":"Regarde"}')).toEqual({ width: 1600, height: 1200, caption: 'Regarde' });
    expect(parseChatImage('{"width":800,"height":600}')).toEqual({ width: 800, height: 600, caption: '' });
  });

  it('rejects anything that is not a valid photo body', () => {
    expect(parseChatImage('bonjour')).toBeNull();
    expect(parseChatImage('{"width":0,"height":10}')).toBeNull();
    expect(parseChatImage('{"width":1.5,"height":10}')).toBeNull();
    expect(parseChatImage('{"width":20000,"height":10}')).toBeNull();
  });

  it('describes a photo in conversation lists', () => {
    expect(chatPreviewText({ kind: 'image', body: '{"width":10,"height":10,"caption":""}', durationMs: null })).toBe('Photo');
    expect(chatPreviewText({ kind: 'image', body: '{"width":10,"height":10,"caption":"Au marché"}', durationMs: null })).toBe('Photo : Au marché');
  });
});

describe('groups', () => {
  it('addresses a group as g:<id>, never confused with a username', () => {
    expect(groupKey(12)).toBe('g:12');
    expect(parseGroupKey('g:12')).toBe(12);
    expect(parseGroupKey('awa')).toBeNull();
    expect(parseGroupKey('g:12x')).toBeNull();
    expect(parseGroupKey(12)).toBeNull();
  });

  it('reads group events and rejects malformed ones', () => {
    expect(parseGroupEvent('{"type":"added","by":"awa","target":"moussa"}')).toEqual({ type: 'added', by: 'awa', target: 'moussa' });
    expect(parseGroupEvent('{"type":"added","by":"awa"}')).toBeNull();
    expect(parseGroupEvent('{"type":"renamed","by":"","name":"x"}')).toBeNull();
    expect(parseGroupEvent('salut')).toBeNull();
  });

  it('words events from the viewer’s side', () => {
    const added = { type: 'added', by: 'awa', target: 'moussa' } as const;
    expect(describeGroupEvent(added)).toBe('awa a ajouté moussa');
    expect(describeGroupEvent(added, 'awa')).toBe('Tu as ajouté moussa');
    expect(describeGroupEvent(added, 'moussa')).toBe('awa t’a ajouté');
    expect(describeGroupEvent({ type: 'left', by: 'awa' }, 'awa')).toBe('Tu as quitté le groupe');
    expect(chatPreviewText({ kind: 'system', body: JSON.stringify({ type: 'created', by: 'awa', name: 'Les As' }), durationMs: null })).toBe(
      'awa a créé le groupe « Les As »',
    );
  });
});
