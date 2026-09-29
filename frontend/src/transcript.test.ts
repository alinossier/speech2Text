import { describe, expect, it } from 'vitest'
import { groupTranscript } from './transcript'

const segments = [
  { startSeconds: 0, endSeconds: 10, speakerId: 'A', text: 'Hello' },
  { startSeconds: 12, endSeconds: 18, speakerId: 'A', text: 'world.' },
  { startSeconds: 20, endSeconds: 28, speakerId: 'B', text: 'Yes.' },
  { startSeconds: 65, endSeconds: 68, speakerId: 'B', text: 'Later' },
  { startSeconds: 70, endSeconds: 75, speakerId: 'B', text: 'again.' },
]

describe('groupTranscript', () => {
  it('keeps speaker changes while showing timestamps at the selected interval', () => {
    expect(groupTranscript(segments, 60)).toEqual([
      { startSeconds: 0, speakerId: 'A', text: 'Hello world.' },
      { startSeconds: null, speakerId: 'B', text: 'Yes.' },
      { startSeconds: 65, speakerId: 'B', text: 'Later again.' },
    ])
    expect(groupTranscript(segments, 120)).toEqual([
      { startSeconds: 0, speakerId: 'A', text: 'Hello world.' },
      { startSeconds: null, speakerId: 'B', text: 'Yes. Later again.' },
    ])
  })

  it('handles an empty transcript', () => {
    expect(groupTranscript([], 60)).toEqual([])
  })
})
