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
  template: `
    <article class="song">
      <div class="artwork"><img *ngIf="cover" [src]="cover" alt="歌曲封面" referrerpolicy="no-referrer"><span *ngIf="!cover" aria-label="暂无封面">♪</span></div>
      <div *ngIf="song">
        <h2>{{song.title}}</h2><p>{{song.artists.join(' / ') || '未知歌手'}}</p><p>{{song.album || '暂无专辑信息'}}</p>
        <audio #audio *ngIf="url && song.available" [src]="url" controls preload="metadata" crossorigin="anonymous"
          (error)="recover(audio)" (loadedmetadata)="restore(audio)" (play)="refreshIfExpired(audio)"></audio>
        <p *ngIf="loading" role="status">正在获取播放地址…</p>
        <p *ngIf="!song.available">音频已删除，暂时无法播放。</p>
        <pre class="selectable-preview">{{song.lyrics.text || lyricsText || '暂无歌词'}}</pre>
      </div>
      <p *ngIf="error" role="alert">{{error}} <button type="button" (click)="load()">重新获取</button></p>
    </article>
  `,
  styles: [`
    :host {display:block; flex:1; min-height:0; overflow:auto; background:var(--panel,#fff); color:var(--ink,#242424)}
    .song {display:grid;grid-template-columns:minmax(90px,180px) minmax(0,1fr);gap:24px;padding:24px}
    .artwork {aspect-ratio:1;display:grid;place-items:center;background:var(--hover,#eef0f3);border-radius:14px;overflow:hidden;font-size:60px;color:var(--muted,#666)}
    img {width:100%;height:100%;object-fit:cover} h2,p {overflow-wrap:anywhere} p{color:var(--muted,#666);margin:6px 0}
    audio {width:100%;margin:16px 0} pre{white-space:pre-wrap;font:inherit;line-height:1.9;max-height:38vh;overflow:auto}
    @media(prefers-color-scheme:dark){:host{--panel:#24272b;--ink:#f1f3f5;--muted:#bcc2c9;--hover:#30343a;color-scheme:dark}.song{background:var(--panel)}}
    button{font:inherit} @media(max-width:520px){.song{grid-template-columns:1fr;gap:12px;padding:16px}.artwork{width:120px}}
  `],
})
export class SongPlayerComponent implements OnInit {
  @Input() token = '';
  song?: Song;
  url = '';
  cover = '';
  expires = 0;
  loading = false;
  error = '';
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
  template: `
    <dialog #dialog aria-modal="true" aria-labelledby="song-editor-title" (cancel)="$event.preventDefault(); !busy && closed.emit()">
      <form (ngSubmit)="save()">
        <header><h2 id="song-editor-title">歌曲信息</h2><button type="button" [disabled]="busy" (click)="closed.emit()">关闭</button></header>
        <p *ngIf="loading" role="status">正在读取歌曲信息…</p>
        <p *ngIf="status === 'pending' || status === 'parsing'" role="status">正在解析内嵌信息…
          <button type="button" (click)="manual()">手动填写</button></p>
        <p *ngIf="status === 'failed'">内嵌信息读取失败，可以手动填写。<button type="button" (click)="retry()">重新解析</button></p>
        <ng-container *ngIf="!loading">
          <p>音频 · {{name}}</p><label *ngIf="song">上传替换音频<input type="file" accept="audio/*,.mp3" (change)="audioFile = $any($event.target).files[0]" [disabled]="busy"></label><label *ngIf="song">替换音频资源 ID<input name="audioResource" [(ngModel)]="audioResource" placeholder="留空使用原音频" [disabled]="busy"></label>
          <label>歌名<input name="title" [(ngModel)]="title" required maxlength="256" [disabled]="busy"></label>
          <label>歌手（每行一位）<textarea name="artists" [(ngModel)]="artists" [disabled]="busy"></textarea></label>
          <label>专辑<input name="album" [(ngModel)]="album" maxlength="256" [disabled]="busy"></label>
          <label>时长（秒）<input type="number" name="duration" [(ngModel)]="durationSeconds" min="0" max="86400" step="0.001" [disabled]="busy"></label>
          <p>{{song?.cover || embeddedCover ? '已有封面，可直接保存或上传新封面。' : '暂无封面，可以稍后补充。'}}</p>
          <label>补充封面<input type="file" accept="image/png,image/jpeg,image/webp" (change)="coverFile = $any($event.target).files[0]; removeCover = false" [disabled]="busy"></label>
          <button type="button" [disabled]="busy" (click)="removeCover = true; useEmbedded = false; coverFile = undefined">移除封面</button>
          <label><input type="checkbox" name="embedded" [(ngModel)]="useEmbedded" [disabled]="busy">使用内嵌封面</label>
          <label>歌词格式<select name="lyricsType" [(ngModel)]="lyricsType" [disabled]="busy">
            <option value="none">无歌词</option><option value="text">纯文本</option><option value="lrc">LRC 同步歌词</option>
            <option *ngIf="lyricsType === 'synchronized'" value="synchronized">保留内嵌同步歌词</option>
          </select></label>
          <label>导入歌词<input type="file" accept=".lrc,.txt" (change)="readLyrics($event)" [disabled]="busy"></label>
          <label *ngIf="lyricsType === 'text' || lyricsType === 'lrc'">歌词<textarea name="lyrics" [(ngModel)]="lyrics" rows="7" [disabled]="busy"></textarea></label>
          <p *ngIf="error" role="alert">{{error}}</p>
          <footer><button type="submit" [disabled]="busy || !title.trim()">{{busy ? '正在保存…' : song ? '保存修改' : '建立歌曲'}}</button></footer>
        </ng-container>
      </form>
    </dialog>
  `,
  styles: [`
    :host{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:#14202d55}
    dialog{position:fixed;inset:0;margin:auto;width:min(480px,calc(100% - 24px));max-height:min(680px,calc(100% - 24px));overflow:auto;border:1px solid var(--line,#ddd);border-radius:16px;background:var(--panel,#fff);color:var(--ink,#242424);padding:20px}
    form,label{display:grid;gap:8px}form{gap:14px}header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:18px}
    input,textarea,select,button{font:inherit;color:inherit;background:var(--canvas,#f7f7f8);border:1px solid var(--line,#ddd);border-radius:6px;padding:7px;max-width:100%}
    dialog::backdrop{background:#14202d66;backdrop-filter:blur(3px)}
    @media(prefers-color-scheme:dark){:host{--panel:#24272b;--ink:#f1f3f5;--muted:#bcc2c9;--canvas:#30343a;--line:#50565e;color-scheme:dark}}
    textarea{resize:vertical}p{font-size:12px;color:var(--muted,#666)}[role=alert]{color:#b42330}footer{justify-content:flex-end}
  `],
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
  private uploadedCover = '';
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
  ngOnDestroy() { this.destroyed = true; clearTimeout(this.timer); this.dialog.nativeElement.close(); }
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
