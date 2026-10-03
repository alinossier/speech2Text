export type Segment = {
  startSeconds: number
  endSeconds: number
  speakerId: string
  text: string
}

export type Job = {
  id: string
  filename: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  error: string | null
  createdAt: string
  updatedAt: string
  durationSeconds: number | null
  speakers: Record<string, string>
  audioDeleted: boolean
  segments?: Segment[]
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init)
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

export function uploadAudio(file: File, onProgress: (loaded: number, total: number) => void): Promise<Job> {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.append('audio', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl}/api/jobs`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check that the backend is available.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Job)
        } catch {
          reject(new Error('The backend returned an invalid upload response.'))
        }
        return
      }
      try {
        const response = JSON.parse(xhr.responseText) as { detail?: string }
        reject(new Error(response.detail || `Upload failed (${xhr.status}).`))
      } catch {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status}).`))
      }
    }
    xhr.send(body)
  })
}

export const getJob = (id: string) => request<Job>(`/api/jobs/${id}`)
export const listJobs = () => request<Job[]>('/api/jobs')
export const renameSpeaker = (jobId: string, speakerId: string, name: string) => request<Job>(`/api/jobs/${jobId}/speakers/${speakerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
export const deleteJob = (id: string) => request<void>(`/api/jobs/${id}`, { method: 'DELETE' })
export const exportUrl = (id: string, format: 'txt' | 'srt', intervalSeconds?: number) =>
  `${baseUrl}/api/jobs/${id}/export/${format}${format === 'txt' && intervalSeconds !== undefined ? `?timestamp_interval_seconds=${intervalSeconds}` : ''}`
