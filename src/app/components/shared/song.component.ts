import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { BaseService } from '../../services/base.service';

export interface Song {
  schema: 'pocklo.song.v1';
  type: 'song';
  song_id: string;
  version: number;
  available: boolean;
  audio_resource_id: string | null;
  title: string;
  artists: string[];
  album: string;
  duration_ms: number | null;
  cover_source: 'resource' | 'embedded' | null;
  cover: { id: string; mime: string } | null;
  lyrics: { type: string; text: string; cues: { time_ms: number; text: string }[] };
  share_url: string | null;
}

@Component({
  selector: 'app-song-player',
  templateUrl: './song-player.component.html',
  styleUrls: ['./song-player.component.less'],
})
export class SongPlayerComponent implements OnInit {
  @Input() token = '';
  song?: Song;
  url = '';
  cover = '';
  expires = 0;
  loading = false;
  error = '';
  playing = false;
  currentTime = 0;
  mediaDuration = 0;
  async togglePlayback(audio: HTMLAudioElement) {
    if (audio.paused) {
      try { await audio.play(); } catch { this.error = '暂时无法播放，请重试。'; }
    } else audio.pause();
  }
  seek(audio: HTMLAudioElement, value: string) {
    const time = Number(value);
    if (!Number.isFinite(time)) return;
    if (Date.now() >= this.expires - 15000) {
      this.position = time;
      this.resume = !audio.paused;
      audio.pause();
      void this.load();
    } else audio.currentTime = time;
  }
  timeLabel(value: number) {
    const seconds = Math.max(0, Math.floor(value || 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  private position = 0;
  private resume = false;
  private retries = 0;
  constructor(private api: BaseService) {}
  ngOnInit() { void this.load(); }
  get lyricsText() { return this.song?.lyrics.cues.map(cue => cue.text).join('\n'); }
  async load() {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      this.song = await this.api.get('/api/song-shares/' + this.token);
      if (!this.song.available) return;
      const media = await this.api.get('/api/song-shares/' + this.token + '/playback');
      this.expires = Date.parse(media.expires_at);
      this.url = media.audio.url;
      this.cover = media.cover?.url || '';
    } catch {
      this.url = '';
      this.cover = '';
      this.error = '分享已失效或无法读取歌曲，请重试。';
    } finally { this.loading = false; }
  }
  recover(audio: HTMLAudioElement) {
    if (this.loading || this.retries >= 1) {
      this.error = '播放失败，请重新获取播放地址。';
      return;
    }
    this.position = audio.currentTime;
    this.resume = !audio.paused;
    this.retries++;
    void this.load();
  }
  refreshIfExpired(audio: HTMLAudioElement) {
    if (Date.now() >= this.expires - 15000) {
      this.position = audio.currentTime;
      this.resume = true;
      audio.pause();
      void this.load();
    }
  }
  restore(audio: HTMLAudioElement) {
    this.mediaDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (this.position) audio.currentTime = this.position;
    this.position = 0;
    if (this.resume) {
      this.resume = false;
      void audio.play().catch(() => {});
    }
  }
}

@Component({
  selector: 'app-song-editor',
  templateUrl: './song-editor.component.html',
  styleUrls: ['./song-editor.component.less'],
})
export class SongEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog', {static:true}) private dialog: ElementRef<HTMLDialogElement>;
  @Input() resource = '';
  @Input() name = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  song?: Song;
  title = '';
  artists = '';
  album = '';
  audioResource = '';
  duration: number | null = null;
  lyricsType = 'none';
  lyrics = '';
  useEmbedded = true;
  embeddedCover = false;
  coverFile?: File;
  audioFile?: File;
  removeCover = false;
  coverPreview = '';
  embeddedPreview = '';
  existingPreview = '';
  advanced = false;
  readonly lyricFormats = [
    {id:'none',name:'无歌词'}, {id:'text',name:'纯文本'}, {id:'lrc',name:'同步歌词'},
  ];
  private uploadedCover = '';
  chooseCover(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { this.error = '封面不能超过 8 MB。'; return; }
    this.clearCoverPreview();
    this.coverFile = file;
    this.removeCover = false;
    this.coverPreview = URL.createObjectURL(file);
  }
  clearCoverPreview() {
    if (this.coverPreview.startsWith('blob:')) URL.revokeObjectURL(this.coverPreview);
    this.coverPreview = '';
  }
  removeArtwork() {
    this.clearCoverPreview();
    this.coverFile = undefined;
    this.uploadedCover = '';
    this.removeCover = true;
    this.useEmbedded = false;
    this.existingPreview = '';
  }
  toggleEmbedded() {
    this.useEmbedded = !this.useEmbedded;
    this.existingPreview = this.useEmbedded ? this.embeddedPreview : '';
    this.removeCover = !this.useEmbedded;
    this.coverFile = undefined;
    this.uploadedCover = '';
    this.clearCoverPreview();
  }
  status = '';
  loading = true;
  busy = false;
  error = '';
  get durationSeconds() { return this.duration === null ? null : this.duration / 1000; }
  set durationSeconds(value: number | null) { this.duration = value === null ? null : Math.round(value * 1000); }
  manual() { clearTimeout(this.timer); this.loading = false; }
  private destroyed = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private api: BaseService) {}
  ngOnInit() { void this.load(); }
  ngAfterViewInit() { this.dialog.nativeElement.showModal(); }
  ngOnDestroy() { this.clearCoverPreview(); this.destroyed = true; clearTimeout(this.timer); this.dialog.nativeElement.close(); }
  async load() {
    try {
      const response = await this.api.get('/api/audio/' + this.resource + '/metadata');
      if (this.destroyed) return;
      this.status = response.status;
      if (!this.song && this.loading) {
        this.song = response.song;
        const data = this.song || response.extracted;
        this.title = data.title || this.name.replace(/\.[^.]+$/, '');
        this.artists = (data.artists || []).join('\n');
        this.album = data.album || '';
        this.duration = data.duration_ms ?? null;
        this.lyricsType = data.lyrics?.type || 'none';
        this.lyrics = data.lyrics?.text || '';
        this.embeddedCover = response.has_embedded_cover;
        this.existingPreview = response.cover_preview_url || '';
        if (!this.song || this.song.cover_source === 'embedded') this.embeddedPreview = this.existingPreview;
        this.useEmbedded = !this.song || this.song.cover_source === 'embedded';
      }
      if (['pending','parsing'].includes(this.status)) {
        // Keep inputs unavailable until suggestions are loaded, avoiding overwriting edits.
        this.timer = setTimeout(() => void this.load(), 1500);
        return;
      }
      this.loading = false;
    } catch { this.error = '无法读取歌曲信息。'; this.loading = false; }
  }
  async retry() {
    this.loading = true;
    try { await this.api.post('/api/audio/' + this.resource + '/metadata', {}); await this.load(); }
    catch { this.loading = false; this.error = '无法重新解析。'; }
  }
  async readLyrics(event: Event) {
    const file: File = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 100000) { this.error = '歌词文件不能超过 100 KB。'; return; }
    this.lyrics = await file.text();
    this.lyricsType = file.name.toLowerCase().endsWith('.lrc') ? 'lrc' : 'text';
  }
  async save() {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const data: any = {audio_resource_id:this.audioResource.trim() || this.resource, title:this.title, artists:this.artists.split('\n').map(v => v.trim()).filter(Boolean),
        album:this.album, duration_ms:this.duration, use_embedded_cover:this.useEmbedded};
      if (this.lyricsType !== 'synchronized') data.lyrics = {type:this.lyricsType, text:this.lyricsType === 'none' ? '' : this.lyrics};
      if (this.coverFile || this.audioFile) {
        const workspace = await this.api.get('/api/res/' + this.resource + '/workspace');
        const parent = workspace.breadcrumbs.at(-2)?.id;
        if (!parent) throw new Error('无法确定上传目录。');
        const upload = async (file: File) => {
          const token = await this.api.get('/api/res/' + parent + '/token', {filename:file.name});
          return this.api.api_upload_file(token.key, token.upload_token, file, null);
        };
        if (this.coverFile) {
          if (this.coverFile.size > 8 * 1024 * 1024) throw new Error('封面不能超过 8 MB。');
          this.uploadedCover = (await upload(this.coverFile)).res_str_id;
          this.coverFile = undefined;
        }
        if (this.audioFile) {
          this.audioResource = (await upload(this.audioFile)).res_str_id;
          data.audio_resource_id = this.audioResource;
          this.audioFile = undefined;
        }
      }
      if (this.removeCover || (this.useEmbedded && this.song?.cover_source === 'resource')) data.cover_resource_id = null;
      if (data.audio_resource_id !== this.resource) delete data.duration_ms;
      if (this.uploadedCover) data.cover_resource_id = this.uploadedCover;
      if (this.song) {
        data.version = this.song.version;
        this.song = await this.api.put('/api/songs/' + this.song.song_id, data);
      } else this.song = await this.api.post('/api/songs/', data);
      this.saved.emit();
    } catch (error) {
      this.error = error?.error?.body?.error === 'version_conflict'
        ? '歌曲已被修改，请关闭后重新打开。' : '保存失败，请检查歌词格式和资源权限后重试。';
    } finally { this.busy = false; }
  }
}
