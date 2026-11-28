import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MAX_VOICE_MS } from '@ludo/engine';

const run = promisify(execFile);

export interface Audio {
  mime: string;
  data: Uint8Array;
}

/** WebM or Ogg, from the first bytes. The demuxer is forced so ffmpeg never guesses what an upload is. */
function container(data: Uint8Array): 'matroska' | 'ogg' | null {
  const head = Buffer.from(data.subarray(0, 4)).toString('hex');
  if (head === '1a45dfa3') return 'matroska';
  if (head === '4f676753') return 'ogg';
  return null;
}

/**
 * Chrome, Android and Firefox record Opus in WebM or Ogg, which many iPhones can't play:
 * those notes become AAC in MP4, which plays everywhere. The original is kept if ffmpeg
 * is missing or fails.
 */
export async function playableVoice(audio: Audio): Promise<Audio> {
  const format = container(audio.data);
  if (!format) return audio;
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'voice-'));
    const input = join(dir, 'in');
    const output = join(dir, 'out.m4a');
    await writeFile(input, audio.data);
    await run(
      'ffmpeg',
      [
        '-nostdin', '-v', 'error',
        '-protocol_whitelist', 'file', '-f', format, '-i', input,
        '-vn', '-t', String(MAX_VOICE_MS / 1000 + 1),
        '-ac', '1', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart',
        output,
      ],
      { timeout: 20_000 },
    );
    return { mime: 'audio/mp4', data: await readFile(output) };
  } catch (err) {
    console.error('Conversion du message vocal impossible', err);
    return audio;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
