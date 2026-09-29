import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, FileAudio, LoaderCircle, Trash2, Upload, UserRound } from 'lucide-react'
import { deleteJob, exportUrl, getJob, Job, listJobs, renameSpeaker, uploadAudio } from './api'
import { DEFAULT_TIMESTAMP_INTERVAL, groupTranscript, TIMESTAMP_INTERVALS } from './transcript'

const ACCEPTED = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'video/mp4']
const MAX_BYTES = 10 * 1024 * 1024 * 1024

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function prettyTime(seconds: number) {
  const rounded = Math.floor(seconds)
  return `${String(Math.floor(rounded / 3600)).padStart(2, '0')}:${String(Math.floor((rounded % 3600) / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}

function statusText(status: Job['status']) {
  return { queued: 'Queued', processing: 'Transcribing', completed: 'Ready', failed: 'Needs attention' }[status]
}

export function App() {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [recent, setRecent] = useState<Job[]>([])
  const [upload, setUpload] = useState<{ filename: string; loaded: number; total: number } | null>(null)
  const [timestampInterval, setTimestampInterval] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem('timestampIntervalSeconds'))
    return TIMESTAMP_INTERVALS.find((interval) => interval === saved) ?? DEFAULT_TIMESTAMP_INTERVAL
  })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listJobs().then(setRecent).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!job || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(async () => {
      try { setJob(await getJob(job.id)) } catch (fetchError) { setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch job status.') }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  async function startUpload(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['mp3', 'mp4', 'wav'].includes(extension || '') || (!ACCEPTED.includes(file.type) && file.type)) {
      setError('Choose an MP3, MP4, or WAV audio file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Files must be 10 GB or smaller.')
      return
    }
    setError(null)
    setUpload({ filename: file.name, loaded: 0, total: file.size })
    try {
      const created = await uploadAudio(file, (loaded, total) => setUpload({ filename: file.name, loaded, total }))
      setJob(created)
      setRecent((items) => [created, ...items])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
    } finally {
      setUpload(null)
    }
  }

  async function removeTranscript() {
    if (!job || !window.confirm('Delete this transcript permanently?')) return
    try { await deleteJob(job.id); setRecent((items) => items.filter((item) => item.id !== job.id)); setJob(null) } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the transcript.') }
  }

  async function removeRecentTranscript(item: Job) {
    if (!window.confirm(`Delete “${item.filename}” permanently?`)) return
    try {
      await deleteJob(item.id)
      setRecent((items) => items.filter((recentItem) => recentItem.id !== item.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the transcript.')
    }
  }

  async function saveSpeaker(speakerId: string, currentName: string) {
    if (!job) return
    const name = window.prompt('Speaker name', currentName)?.trim()
    if (!name || name === currentName) return
    try { setJob(await renameSpeaker(job.id, speakerId, name)) } catch (renameError) { setError(renameError instanceof Error ? renameError.message : 'Could not rename the speaker.') }
  }

  async function copyTranscript() {
    if (!job?.segments) return
    const output = groupTranscript(job.segments, timestampInterval).map((block) =>
      `${block.startSeconds === null ? '' : `[${prettyTime(block.startSeconds)}] `}${job.speakers[block.speakerId] || block.speakerId}: ${block.text}`
    ).join('\n\n')
    await navigator.clipboard.writeText(output)
  }

  function changeTimestampInterval(interval: number) {
    setTimestampInterval(interval)
    window.localStorage.setItem('timestampIntervalSeconds', String(interval))
  }

  return <main>
    <header className="topbar"><div className="brand"><FileAudio size={22} /><span>Mishonin Transcript Desk</span></div><span className="network">Private network</span></header>
    <section className="workspace">
      {!job ? <section className="upload-panel" aria-labelledby="upload-title">
        <div className="eyebrow">Local speech to text</div>
        <h1 id="upload-title">Turn a conversation into a clear transcript.</h1>
        <p className="subtle">English audio with local transcription and speaker separation.</p>
        {upload ? <UploadProgress upload={upload} /> : <div className={`dropzone ${dragging ? 'dragging' : ''}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) startUpload(file) }}>
          <Upload size={30} strokeWidth={1.6} />
          <strong>Drop an audio file here</strong><span>or choose a file from this computer</span><small>MP3, MP4, WAV · up to 10 GB</small>
        </div>}
        <input ref={inputRef} hidden type="file" disabled={Boolean(upload)} accept=".mp3,.mp4,.wav,audio/*,video/mp4" onChange={(event) => { const file = event.target.files?.[0]; if (file) startUpload(file); event.currentTarget.value = '' }} />
        {error && <p className="error" role="alert">{error}</p>}
      </section> : <TranscriptView job={job} error={error} timestampInterval={timestampInterval} onTimestampIntervalChange={changeTimestampInterval} onDelete={removeTranscript} onCopy={copyTranscript} onRename={saveSpeaker} />}
      {!job && recent.length > 0 && <section className="recent"><div className="recent-heading"><div><h2>Recent transcripts</h2><p>Transcripts remain available until deleted. Save anything you need elsewhere, then remove it when you are finished.</p></div></div><div className="recent-list">{recent.map((item) => <div key={item.id} className="recent-item"><button className="recent-open" onClick={() => getJob(item.id).then(setJob).catch(() => setError('Transcript is no longer available.'))}><span>{item.filename}</span><small className={`recent-status ${item.status}`}>{statusText(item.status)}</small></button><button className="recent-delete" onClick={() => removeRecentTranscript(item)} title={`Delete ${item.filename}`} aria-label={`Delete ${item.filename}`}><Trash2 size={17} /></button></div>)}</div></section>}
    </section>
    <footer className="model-note">Transcription powered by Whisper large-v3.</footer>
  </main>
}

function UploadProgress({ upload }: { upload: { filename: string; loaded: number; total: number } }) {
  const progress = upload.total ? Math.min(100, Math.round((upload.loaded / upload.total) * 100)) : 0
  return <div className="upload-progress" role="status" aria-live="polite">
    <div className="upload-progress-heading"><LoaderCircle size={22} className="spin" /><div><strong>Uploading audio</strong><span>{upload.filename}</span></div><b>{progress}%</b></div>
    <div className="progress-track" aria-label={`Upload progress: ${progress}%`}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
    <small>{progress === 100 ? 'Saving the file and adding it to the transcription queue.' : `${formatBytes(upload.loaded)} of ${formatBytes(upload.total)} uploaded`}</small>
  </div>
}

function TranscriptView({ job, error, timestampInterval, onTimestampIntervalChange, onDelete, onCopy, onRename }: { job: Job; error: string | null; timestampInterval: number; onTimestampIntervalChange: (interval: number) => void; onDelete: () => void; onCopy: () => void; onRename: (id: string, name: string) => void }) {
  const pending = job.status === 'queued' || job.status === 'processing'
  const blocks = groupTranscript(job.segments ?? [], timestampInterval)
  return <section className="transcript-shell">
    <div className="job-header"><div><div className="eyebrow">{job.filename}</div><h1>{statusText(job.status)}</h1></div><div className={`status ${job.status}`}>{pending && <LoaderCircle size={15} className="spin" />}{job.status === 'completed' && <Check size={15} />}{statusText(job.status)}</div></div>
    {pending && <div className="processing"><LoaderCircle size={24} className="spin" /><div><strong>{job.status === 'queued' ? 'Waiting for the GPU worker' : 'Transcribing and separating speakers'}</strong><p>The source file will be permanently deleted when processing ends.</p></div></div>}
    {job.status === 'failed' && <div className="error"><strong>Processing failed.</strong> {job.error}</div>}
    {job.status === 'completed' && <>
      <div className="transcript-toolbar"><span className="privacy-note">Source audio deleted</span><div className="actions"><button className="icon-button" onClick={onCopy} title="Copy transcript"><Copy size={18} /></button><a className="icon-button" href={exportUrl(job.id, 'txt', timestampInterval)} title="Download TXT"><Download size={18} /></a><a className="icon-button" href={exportUrl(job.id, 'srt')} title="Download SRT"><span className="srt">SRT</span></a><button className="icon-button danger" onClick={onDelete} title="Delete transcript"><Trash2 size={18} /></button></div></div>
      <div className="transcript-settings"><label htmlFor="timestamp-interval">Show timestamps every</label><select id="timestamp-interval" value={timestampInterval} onChange={(event) => onTimestampIntervalChange(Number(event.target.value))}><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option></select></div>
      <div className="speaker-list">{Object.entries(job.speakers).map(([id, name]) => <button key={id} className="speaker-button" onClick={() => onRename(id, name)} title="Rename speaker"><UserRound size={15} />{name}</button>)}</div>
      <div className="transcript">{blocks.map((block, index) => <article className="turn" key={index}>{block.startSeconds === null ? <span className="timestamp-spacer" aria-hidden="true" /> : <time>{prettyTime(block.startSeconds)}</time>}<div><button className="speaker-name" onClick={() => onRename(block.speakerId, job.speakers[block.speakerId] || block.speakerId)}>{job.speakers[block.speakerId] || block.speakerId}</button><p>{block.text}</p></div></article>)}</div>
    </>}
    {(job.status === 'failed' || job.status === 'completed') && <button className="new-file" onClick={onDelete}>{job.status === 'completed' ? 'Delete transcript' : 'Remove failed job'}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
