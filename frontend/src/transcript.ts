import type { Segment } from './api'

export const TIMESTAMP_INTERVALS = [0, 30, 60, 120, 300] as const
export const DEFAULT_TIMESTAMP_INTERVAL = 60

export type TranscriptBlock = {
  startSeconds: number | null
  speakerId: string
  text: string
}

export function groupTranscript(segments: Segment[], intervalSeconds: number): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = []
  let nextTimestamp = -Infinity

  for (const segment of segments) {
    const previous = blocks[blocks.length - 1]
    const timed = intervalSeconds === 0
      ? !previous || previous.speakerId !== segment.speakerId
      : segment.startSeconds >= nextTimestamp
    if (timed) nextTimestamp = segment.startSeconds + intervalSeconds

    if (previous && previous.speakerId === segment.speakerId && !timed) {
      previous.text += ` ${segment.text}`
    } else {
      blocks.push({ startSeconds: timed ? segment.startSeconds : null, speakerId: segment.speakerId, text: segment.text })
    }
  }

  return blocks
}
