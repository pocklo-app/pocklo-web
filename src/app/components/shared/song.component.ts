import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { BaseService } from '../../services/base.service';
import type { Entry, Workspace } from '../workspace/workspace.component';

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
  @ViewChild('lyricsPicker', {static:true}) private lyricsPicker: ElementRef<HTMLDialogElement>;
  @Input() resource = '';
  @Input() name = '';
  @Input() directory = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  song?: Song;
  title = '';
  artists = '';
  album = '';
  duration: number | null = null;
  lyricsType = 'none';
  lyricsUpdate?: { type: 'lrc' | 'none'; text: string };
  lyricsName = '';
  readingLyrics = false;
  pickerListing?: Workspace;
  pickerLoading = false;
  pickerError = '';
  pickedLyrics?: Entry;
  dropTarget: 'cover' | 'lyrics' | null = null;
  useEmbedded = true;
  embeddedCover = false;
  coverFile?: File;
  removeCover = false;
  coverPreview = '';
  embeddedPreview = '';
  existingPreview = '';
  private uploadedCover = '';
  chooseFile(event: Event, kind: 'cover' | 'lyrics') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.useFile(file, kind);
  }
  dragOver(event: DragEvent, kind: 'cover' | 'lyrics') {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    const blocked = this.busy || this.readingLyrics;
    event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
    this.dropTarget = blocked ? null : kind;
  }
  dragLeave(event: DragEvent, kind: 'cover' | 'lyrics') {
    if (this.dropTarget === kind && !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      this.dropTarget = null;
    }
  }
  dropFile(event: DragEvent, kind: 'cover' | 'lyrics') {
    event.preventDefault();
    event.stopPropagation();
    this.dropTarget = null;
    if (this.busy || this.readingLyrics) return;
    const files = event.dataTransfer?.files;
    if (files?.length === 1) this.useFile(files[0], kind);
    else this.error = '请一次拖入一个文件。';
  }
  private useFile(file: File, kind: 'cover' | 'lyrics') {
    this.error = '';
    if (kind === 'lyrics') {
      void this.readLyricsFile(file);
      return;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) && !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      this.error = '请选择 JPG、PNG 或 WebP 封面。';
      return;
    }
    if (file.size > 8 * 1024 * 1024) { this.error = '封面不能超过 8 MB。'; return; }
    this.clearCoverPreview();
    this.uploadedCover = '';
    this.coverFile = file;
    this.useEmbedded = false;
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
  ngOnDestroy() {
    this.clearCoverPreview();
    this.destroyed = true;
    clearTimeout(this.timer);
    this.lyricsPicker.nativeElement.close();
    this.dialog.nativeElement.close();
  }
  async load() {
    try {
      const response = await this.api.get('/api/audio/' + this.resource + '/metadata');
      if (this.destroyed) return;
      this.status = response.status;
      if (this.loading) {
        this.song = response.song;
        const data = this.song || response.extracted;
        this.title = data.title || this.name.replace(/\.[^.]+$/, '');
        this.artists = (data.artists || []).join('\n');
        this.album = data.album || '';
        this.duration = data.duration_ms ?? null;
        const type = data.lyrics?.type;
        this.lyricsType = type === 'lrc' || type === 'synchronized' || (type === 'text' && !!this.song)
          ? type : 'none';
        this.embeddedCover = response.has_embedded_cover;
        this.existingPreview = response.cover_preview_url || '';
        this.embeddedPreview = response.embedded_cover_url || '';
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
  private async readLyricsFile(file: File) {
    if (!/\.lrc$/i.test(file.name)) { this.error = '请选择 .lrc 同步歌词文件。'; return; }
    if (file.size > 100_000) { this.error = '歌词文件不能超过 100 KB。'; return; }
    this.readingLyrics = true;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!this.destroyed) this.setLyrics(file.name, text);
    } catch (error) {
      this.error = error instanceof TypeError ? '无法读取歌词，请使用 UTF-8 编码的 LRC 文件。'
        : error instanceof Error ? error.message : '无法读取歌词文件。';
    }
    finally { this.readingLyrics = false; }
  }
  private setLyrics(name: string, text: string) {
    if (!/\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]/.test(text)) {
      throw new Error('LRC 文件需要包含歌词时间标签。');
    }
    this.lyricsName = name;
    this.lyricsType = 'lrc';
    this.lyricsUpdate = {type: 'lrc', text};
  }
  removeLyrics() {
    this.lyricsName = '';
    this.lyricsType = 'none';
    this.lyricsUpdate = {type: 'none', text: ''};
  }
  get lyricEntries() {
    return this.pickerListing?.entries.filter(item => item.folder || /\.lrc$/i.test(item.name)) || [];
  }
  openLyricsPicker() {
    this.pickerListing = undefined;
    this.lyricsPicker.nativeElement.showModal();
    void this.browseLyrics(this.directory);
  }
  async browseLyrics(directory: string) {
    this.pickerLoading = true;
    this.pickerError = '';
    this.pickedLyrics = undefined;
    try {
      if (!directory) throw new Error();
      const listing = await this.api.get('/api/res/' + directory + '/workspace');
      if (!listing.can_manage || !listing.resource.folder) throw new Error();
      this.pickerListing = listing;
    } catch { this.pickerError = '无法读取此目录。'; }
    finally { this.pickerLoading = false; }
  }
  closeLyricsPicker() {
    if (!this.pickerLoading) this.lyricsPicker.nativeElement.close();
  }
  async importLyricsResource() {
    const item = this.pickedLyrics;
    if (!item || this.pickerLoading) return;
    this.pickerError = '';
    if (item.size > 100_000) { this.pickerError = '歌词文件不能超过 100 KB。'; return; }
    this.pickerLoading = true;
    try {
      const content = await this.api.get('/api/res/' + item.id + '/content');
      if (content.kind !== 'text' || content.truncated || typeof content.text !== 'string') throw new Error('无法读取歌词文件。');
      if (new TextEncoder().encode(content.text).length > 100_000) throw new Error('歌词文件不能超过 100 KB。');
      this.setLyrics(item.name, content.text);
      this.error = '';
      this.lyricsPicker.nativeElement.close();
    } catch (error) {
      this.pickerError = error instanceof Error ? error.message : '无法读取歌词文件。';
    } finally { this.pickerLoading = false; }
  }
  async save() {
    if (this.busy || this.readingLyrics) return;
    this.busy = true;
    this.error = '';
    try {
      const data: any = {title:this.title, artists:this.artists.split('\n').map(v => v.trim()).filter(Boolean),
        album:this.album, duration_ms:this.duration, use_embedded_cover:this.useEmbedded};
      if (this.lyricsUpdate) data.lyrics = this.lyricsUpdate;
      if (this.coverFile && !this.uploadedCover) {
        const workspace = await this.api.get('/api/res/' + this.resource + '/workspace');
        const parent = workspace.breadcrumbs.at(-2)?.id;
        if (!parent) throw new Error('无法确定上传目录。');
        const token = await this.api.get('/api/res/' + parent + '/token', {filename:this.coverFile.name});
        const uploaded = await this.api.api_upload_file(token.key, token.upload_token, this.coverFile, null);
        this.uploadedCover = uploaded.res_str_id;
      }
      if (this.removeCover || (this.useEmbedded && this.song?.cover_source === 'resource')) data.cover_resource_id = null;
      if (this.uploadedCover) data.cover_resource_id = this.uploadedCover;
      if (this.song) {
        data.version = this.song.version;
        this.song = await this.api.put('/api/songs/' + this.song.song_id, data);
      } else this.song = await this.api.post('/api/songs/', {...data, audio_resource_id: this.resource});
      this.saved.emit();
    } catch (error) {
      this.error = error?.error?.body?.error === 'version_conflict'
        ? '歌曲已被修改，请关闭后重新打开。' : '保存失败，请检查歌词格式和资源权限后重试。';
    } finally { this.busy = false; }
  }
}
