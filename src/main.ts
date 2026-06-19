import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import './styles.css'

interface Song {
  title: string
  artist: string
  imge_path: string
  duration: number
  mp3_path: string
}

let songs: Song[] = []
let currentIndex = -1
type LoopMode = 'none' | 'one' | 'all'
let loopMode: LoopMode = (localStorage.getItem('loop_mode') as LoopMode) || 'none'
let lyrics: { time: number; text: string }[] = []

const audio = new Audio()
audio.volume = 1
audio.muted = false
document.body.appendChild(audio)

audio.addEventListener('error', () => {
  console.error('audio error:', audio.error?.code, audio.error?.message)
})
audio.addEventListener('loadstart', () => console.log('audio: loadstart'))
audio.addEventListener('loadedmetadata', () => console.log('audio: loadedmetadata', audio.duration))
audio.addEventListener('canplay', () => console.log('audio: canplay'))
audio.addEventListener('play', () => console.log('audio: play'))
audio.addEventListener('playing', () => console.log('audio: playing'))
audio.addEventListener('waiting', () => console.log('audio: waiting'))
audio.addEventListener('stalled', () => console.log('audio: stalled'))

const playlistBtn = document.getElementById('playlistBtn')!
const songListPanel = document.getElementById('songListPanel')!
const songListContainer = document.getElementById('songListContainer')!
const recordDisc = document.getElementById('recordDisc')!
const playBtn = document.getElementById('playBtn')!
const prevBtn = document.getElementById('prevBtn')!
const nextBtn = document.getElementById('nextBtn')!
const selectDirBtn = document.getElementById('selectDirBtn')!
const musicDirDisplay = document.getElementById('musicDirDisplay')!
const progressInput = document.getElementById('progress') as HTMLInputElement
const currentTimeSpan = document.getElementById('currentTime')!
const durationSpan = document.getElementById('duration')!
const footerTitle = document.getElementById('footerTitle')!
const footerArtist = document.getElementById('footerArtist')!
const volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement
const loopBtn = document.getElementById('loopBtn')!
const lyricsContainer = document.getElementById('lyricsContainer')!

recordDisc.classList.add('paused')

const iconPlay = `<svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
const iconPause = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`

playlistBtn.addEventListener('click', () => {
  songListPanel.classList.toggle('open')
})

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseLRC(text: string): { time: number; text: string }[] {
  const lines = text.split('\n')
  const result: { time: number; text: string }[] = []
  const re = /\[(\d+):(\d+\.\d+)\](.*)/
  for (const line of lines) {
    const m = line.match(re)
    if (m) {
      const sec = parseInt(m[1]) * 60 + parseFloat(m[2])
      const txt = m[3].trim()
      if (txt) result.push({ time: sec, text: txt })
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

function computeLyricsPath(mp3Path: string): string {
  const idx = mp3Path.lastIndexOf('/')
  const dir = mp3Path.slice(0, idx)
  const name = mp3Path.slice(idx + 1).replace(/\.[^.]+$/, '')
  return `${dir}/歌词/${name}.txt`
}

function loadLyrics(mp3Path: string) {
  lyrics = []
  lyricsContainer.innerHTML = '<p class="text-gray-500 text-center mt-20">加载歌词中...</p>'
  invoke<string>('read_text_file', { path: computeLyricsPath(mp3Path) })
    .then(text => {
      lyrics = parseLRC(text)
      if (lyrics.length === 0) {
        lyricsContainer.innerHTML = '<p class="text-gray-500 text-center mt-20">暂无歌词</p>'
        return
      }
      lyricsContainer.innerHTML = lyrics
        .map((_, i) => `<p class="lyric-line text-gray-500 text-center transition-all duration-300" data-idx="${i}"></p>`)
        .join('')
    })
    .catch(() => {
      lyricsContainer.innerHTML = '<p class="text-gray-500 text-center mt-20">暂无歌词</p>'
    })
}

function updateLyrics(time: number) {
  if (lyrics.length === 0) return
  let activeIdx = -1
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (time >= lyrics[i].time) { activeIdx = i; break }
  }
  const lines = lyricsContainer.querySelectorAll('.lyric-line')
  lines.forEach((el, i) => {
    const p = el as HTMLElement
    p.textContent = lyrics[i].text
    p.className = `lyric-line text-center transition-all duration-300 ${i === activeIdx ? 'text-white text-lg font-medium my-3' : 'text-gray-500 text-sm my-2'}`
  })
  if (activeIdx >= 0) {
    const active = lines[activeIdx] as HTMLElement
    active.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function renderSongList() {
  songListContainer.innerHTML = songs
    .map(
      (s, i) => `
    <div class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group ${i === currentIndex ? 'bg-white/10' : ''}" data-index="${i}">
      <img class="w-10 h-10 rounded object-cover shrink-0" src="/default-cover.jpg">
      <div class="min-w-0 flex-1">
        <p class="text-sm text-white truncate group-hover:text-blue-400 transition-colors">${s.title}</p>
        <p class="text-xs text-gray-400 truncate">${s.artist || '未知艺术家'}</p>
      </div>
      <span class="text-xs text-gray-500">${formatDuration(s.duration)}</span>
    </div>`
    )
    .join('')
}

function playSong(index: number) {
  const song = songs[index]
  if (!song) return

  currentIndex = index
  renderSongList()

  footerTitle.textContent = song.title
  footerArtist.textContent = song.artist || '未知艺术家'
  progressInput.value = '0'
  currentTimeSpan.textContent = '0:00'
  durationSpan.textContent = formatDuration(song.duration)

  loadLyrics(song.mp3_path)
  invoke<string>('read_audio_file', { path: song.mp3_path }).then(url => {
    audio.src = url
    return audio.play()
  }).then(() => {
    recordDisc.classList.remove('paused')
    playBtn.innerHTML = iconPause
  }).catch(e => {
    console.error('playSong failed:', e)
  })
}

songListContainer.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null
  if (!item) return
  const index = parseInt(item.dataset.index!)
  if (index === currentIndex) {
    togglePlay()
  } else {
    playSong(index)
  }
})

function togglePlay() {
  if (songs.length === 0) return
  if (currentIndex === -1) { playSong(0); return }

  if (audio.paused) {
    audio.play().catch(e => console.error('togglePlay play() failed:', e))
    recordDisc.classList.remove('paused')
    playBtn.innerHTML = iconPause
  } else {
    audio.pause()
    recordDisc.classList.add('paused')
    playBtn.innerHTML = iconPlay
  }
}

playBtn.addEventListener('click', togglePlay)
recordDisc.addEventListener('click', togglePlay)

prevBtn.addEventListener('click', () => {
  if (songs.length === 0) return
  const i = (currentIndex - 1 + songs.length) % songs.length
  playSong(i)
})

nextBtn.addEventListener('click', () => {
  if (songs.length === 0) return
  const i = (currentIndex + 1) % songs.length
  playSong(i)
})

volumeSlider.addEventListener('input', () => {
  audio.volume = parseInt(volumeSlider.value) / 100
})

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return
  progressInput.value = String((audio.currentTime / audio.duration) * 100)
  currentTimeSpan.textContent = formatDuration(Math.floor(audio.currentTime))
  updateLyrics(audio.currentTime)
})

audio.addEventListener('loadedmetadata', () => {
  durationSpan.textContent = formatDuration(Math.floor(audio.duration))
})

audio.addEventListener('ended', () => {
  if (loopMode === 'one') {
    playSong(currentIndex)
  } else if (loopMode === 'all') {
    nextBtn.click()
  }
})

const repeatSvg = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`
const repeatOneSvg = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="currentColor">1</text></svg>`

function updateLoopBtn() {
  localStorage.setItem('loop_mode', loopMode)
  loopBtn.classList.remove('text-gray-500', 'text-blue-400', 'text-green-400')
  if (loopMode === 'none') {
    loopBtn.classList.add('text-gray-500')
    loopBtn.title = '循环模式：无'
    loopBtn.innerHTML = repeatSvg
  } else if (loopMode === 'all') {
    loopBtn.classList.add('text-blue-400')
    loopBtn.title = '循环模式：列表循环'
    loopBtn.innerHTML = repeatSvg
  } else {
    loopBtn.classList.add('text-green-400')
    loopBtn.title = '循环模式：单曲循环'
    loopBtn.innerHTML = repeatOneSvg
  }
}

loopBtn.addEventListener('click', () => {
  const modes: LoopMode[] = ['none', 'all', 'one']
  loopMode = modes[(modes.indexOf(loopMode) + 1) % 3]
  updateLoopBtn()
})
updateLoopBtn()

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  switch (e.code) {
    case 'Space':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowUp':
      e.preventDefault()
      audio.volume = Math.min(1, audio.volume + 0.05)
      volumeSlider.value = String(Math.round(audio.volume * 100))
      break
    case 'ArrowDown':
      e.preventDefault()
      audio.volume = Math.max(0, audio.volume - 0.05)
      volumeSlider.value = String(Math.round(audio.volume * 100))
      break
    case 'ArrowRight':
      e.preventDefault()
      if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5)
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5)
      break
  }
})

progressInput.addEventListener('input', () => {
  if (!audio.duration) return
  audio.currentTime = (parseFloat(progressInput.value) / 100) * audio.duration
})

selectDirBtn.addEventListener('click', async () => {
  const dir = await open({ directory: true, multiple: false, title: '选择音乐目录' })
  if (!dir) return

  localStorage.setItem('music_dir', dir)
  musicDirDisplay.textContent = dir
  try {
    songs = await invoke<Song[]>('get_music_list', { path: dir })
  } catch (e) {
    alert('读取失败: ' + e)
    return
  }
  currentIndex = -1
  renderSongList()
  footerTitle.textContent = '未在播放'
  footerArtist.textContent = 'Eternity Music'
})

  ; (async () => {
    const dir = localStorage.getItem('music_dir') || '/home/eternity/Music'
    musicDirDisplay.textContent = dir
    try {
      songs = await invoke<Song[]>('get_music_list', { path: dir })
      renderSongList()
    } catch (e) {
      console.error('自动加载失败:', e)
    }
  })()
