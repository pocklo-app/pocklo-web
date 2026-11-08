import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { BaseService } from '../../services/base.service';
import { ResourceService } from '../../services/resource.service';
import { UserService } from '../../services/user.service';

interface Entry {
  id: string;
  name: string;
  folder: boolean;
  preview: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'text' | 'link' | null;
  size: number;
  created_at: string;
  thumbnail: string | null;
  location?: string;
}

interface Workspace {
  resource: Entry;
  entries: Entry[];
  breadcrumbs: Array<{ id: string; name: string }>;
  can_manage: boolean;
  can_delete: boolean;
  has_more: boolean;
}

interface Share {
  token: string;
  name: string;
  resource_id: string;
  folder: boolean;
  created_at: string;
}

interface Preview {
  kind: string;
  url?: string;
  text?: string;
  truncated?: boolean;
}

const FILE_TYPES: Record<string, { label: string; extensions: string }> = {
  folder: { label: '目录', extensions: '' },
  pdf: { label: 'PDF', extensions: 'pdf' },
  image: { label: '图片', extensions: 'png jpg jpeg gif webp avif heic heif bmp tiff tif ico dng raw cr2 nef arw' },
  video: { label: '视频', extensions: 'mp4 m4v mov mkv webm avi wmv flv mpeg mpg ts m2ts 3gp' },
  audio: { label: '音频', extensions: 'mp3 wav flac aac m4a ogg opus aiff wma mid midi' },
  markdown: { label: 'Markdown', extensions: 'md markdown mdown mdx' },
  text: { label: '文本', extensions: 'txt log nfo' },
  link: { label: '链接', extensions: 'url webloc desktop' },
  document: { label: '文档', extensions: 'doc docx docm odt rtf pages wps' },
  sheet: { label: '表格', extensions: 'xls xlsx xlsm ods csv tsv numbers et' },
  slides: { label: '演示文稿', extensions: 'ppt pptx pptm odp key dps' },
  archive: { label: '压缩包', extensions: 'zip rar 7z tar gz bz2 xz zst tgz tbz tbz2 txz' },
  code: { label: '源代码', extensions: 'js jsx ts tsx py rb php go rs java kt swift c h cpp hpp cs sh bash zsh ps1 bat sql lua r dart scala vue svelte ipynb' },
  web: { label: '网页', extensions: 'html htm xhtml css scss sass less mhtml' },
  data: { label: '数据与配置', extensions: 'json jsonl xml yaml yml toml ini conf cfg env plist parquet arrow avro' },
  executable: { label: '程序与安装包', extensions: 'exe msi apk aab app pkg deb rpm appimage jar dll so dylib ipa' },
  font: { label: '字体', extensions: 'ttf otf ttc woff woff2 eot' },
  ebook: { label: '电子书', extensions: 'epub mobi azw azw3 fb2 cbz cbr' },
  vector: { label: '矢量图', extensions: 'svg svgz ai eps emfs emf wmf' },
  design: { label: '设计文件', extensions: 'psd psb sketch fig xd indd idml xcf afdesign' },
  database: { label: '数据库', extensions: 'db sqlite sqlite3 dbf mdb accdb' },
  disk: { label: '磁盘映像', extensions: 'iso dmg img vhd vhdx vmdk qcow2' },
  subtitle: { label: '字幕', extensions: 'srt vtt ass ssa sub' },
  cad: { label: '3D 与 CAD', extensions: 'dwg dxf step stp iges igs stl obj fbx glb gltf blend 3mf' },
  file: { label: '文件', extensions: '' },
};
const TYPE_BY_EXTENSION = new Map(
  Object.entries(FILE_TYPES).flatMap(([type, { extensions }]) =>
    extensions.split(' ').filter(Boolean).map(extension => [extension, type] as const)),
);

@Component({
  selector: 'app-workspace',
  templateUrl: './workspace.component.html',
  styleUrls: [
    '../../../assets/css/icon-fonts.css',
    './workspace.component.less',
  ],
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  @ViewChild('previewDialog', { static: true }) private previewDialog: ElementRef<HTMLDialogElement>;

  data: Workspace | null = null;
  selected: Entry | null = null;
  modalItem: Entry | null = null;
  preview: Preview | null = null;
  shares: Share[] = [];
  shareToken = '';
  resourceId = '';
  query = '';
  section: 'files' | 'shares' = 'files';
  loading = true;
  previewLoading = false;
  busy = false;
  error = '';
  notice = '';
  previewError = '';
  editor: 'folder' | 'link' | 'rename' | null = null;
  draft = '';
  linkUrl = '';
  operationError = '';
  cut: Entry | null = null;
  deleteTarget: Entry | null = null;
  sort: 'name' | 'created_at' | 'size' = 'name';
  ascending = true;
  view: 'list' | 'grid' = localStorage.getItem('disk.directory-view') === 'grid' ? 'grid' : 'list';

  private routeSubscription: Subscription;
  private searchTimer: ReturnType<typeof setTimeout>;
  private requestNumber = 0;
  private previewNumber = 0;
  private renameTarget: Entry | null = null;
  private cutParentId = '';
  private previewOrigin: { trigger: HTMLElement | null; x: number; y: number; overflow: string };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: BaseService,
    private resources: ResourceService,
    public user: UserService,
  ) {}

  ngOnInit() {
    this.routeSubscription = combineLatest([this.route.paramMap, this.route.queryParamMap])
      .subscribe(([params, query]) => {
        clearTimeout(this.searchTimer);
        this.shareToken = params.get('token') || '';
        this.resourceId = (this.shareToken ? query.get('folder') : params.get('res_str_id')) || '';
        this.section = 'files';
        this.query = '';
        this.data = null;
        this.notice = '';
        this.closeInspector();
        void this.load();
      });
  }

  ngOnDestroy() {
    this.closePreview();
    this.routeSubscription.unsubscribe();
    clearTimeout(this.searchTimer);
    this.requestNumber++;
    this.previewNumber++;
  }

  private credentials() {
    if (this.shareToken) return { share: this.shareToken };
    return {};
  }

  private message(error: any, fallback: string) {
    return error?.error?.msg || (typeof error === 'string' ? error : fallback);
  }

  private async getWorkspace(id: string, query = ''): Promise<Workspace> {
    const options = { q: query };
    if (this.shareToken) {
      return this.api.get('/api/shares/' + encodeURIComponent(this.shareToken), {
        ...options, resource: id,
      });
    }
    return this.api.get('/api/res/' + encodeURIComponent(id) + '/workspace', {
      ...this.credentials(), ...options,
    });
  }

  async load() {
    const request = ++this.requestNumber;
    this.loading = true;
    this.error = '';
    try {
      const data = await this.getWorkspace(this.resourceId, this.query.trim());
      if (request !== this.requestNumber) return;
      this.data = data;
      if (!data.resource.folder) {
        this.selected = data.resource;
        void this.loadPreview(data.resource);
      }
    } catch (error) {
      if (request !== this.requestNumber) return;
      this.error = this.message(error, '无法连接到小兜，请稍后重试。');
    } finally {
      if (request === this.requestNumber) this.loading = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  focusSearch(event: KeyboardEvent) {
    if (event.key === 'Escape' && !this.modalItem && !this.busy) {
      if (this.editor) this.cancelEdit();
      else if (this.deleteTarget) this.deleteTarget = null;
      else if (this.cut) this.cancelMove();
      else if (this.selected && this.data?.resource.folder) this.closeInspector();
      return;
    }
    if (this.modalItem || event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey ||
        (event.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
    const input = document.getElementById('drive-search');
    if (input) {
      event.preventDefault();
      input.focus();
    }
  }

  updateQuery(value: string) {
    this.query = value;
    this.selected = null;
    if (this.editor === 'rename') this.cancelEdit();
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  go(id: string) {
    if (id === this.data?.resource.id) return;
    if (this.shareToken) {
      void this.router.navigate(['/share', this.shareToken], { queryParams: { folder: id } });
    } else {
      void this.router.navigate(['/res', id]);
    }
    window.scrollTo(0, 0);
  }

  showFiles() {
    this.section = 'files';
    this.error = '';
    void this.load();
  }

  async showShares() {
    clearTimeout(this.searchTimer);
    const request = ++this.requestNumber;
    this.section = 'shares';
    this.closeInspector();
    this.error = '';
    this.notice = '';
    this.loading = true;
    try {
      const { links } = await this.api.get('/api/shares/');
      if (request === this.requestNumber) {
        this.shares = links;
      }
    } catch (error) {
      if (request === this.requestNumber) this.error = this.message(error, '无法读取分享列表。');
    } finally {
      if (request === this.requestNumber) this.loading = false;
    }
  }

  select(item: Entry) {
    if (this.selected?.id === item.id) return;
    this.closeInspector();
    this.selected = item;
  }

  openItem(item: Entry, event: Event) {
    event.preventDefault();
    if (this.busy) return;
    if (item.folder) this.go(item.id);
    else this.openPreview(item, event);
  }

  openPreview(item: Entry, event: Event) {
    const dialog = this.previewDialog.nativeElement;
    if (item.folder || dialog.open) return;
    this.previewOrigin = {
      trigger: event.currentTarget as HTMLElement,
      x: window.scrollX,
      y: window.scrollY,
      overflow: document.documentElement.style.overflow,
    };
    this.modalItem = item;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    void this.loadPreview(item);
  }

  closePreview(event?: Event) {
    event?.preventDefault();
    if (!this.modalItem) return;
    this.previewDialog.nativeElement.close();
    this.modalItem = null;
    this.resetPreview();
    const { trigger, x, y, overflow } = this.previewOrigin;
    document.documentElement.style.overflow = overflow;
    trigger?.focus({ preventScroll: true });
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
  }

  closeInspector() {
    this.closePreview();
    this.selected = null;
    this.deleteTarget = null;
    this.cancelEdit();
    this.resetPreview();
  }

  private resetPreview() {
    this.preview = null;
    this.previewError = '';
    this.previewLoading = false;
    this.previewNumber++;
  }

  async loadPreview(item: Entry) {
    if (item.folder) return;
    const request = ++this.previewNumber;
    this.preview = null;
    this.previewError = '';
    this.previewLoading = true;
    try {
      const preview = await this.api.get('/api/res/' + encodeURIComponent(item.id) + '/content', this.credentials());
      if (request === this.previewNumber) this.preview = preview;
    } catch (error) {
      if (request === this.previewNumber) this.previewError = this.message(error, '无法预览此文件。');
    } finally {
      if (request === this.previewNumber) this.previewLoading = false;
    }
  }

  async download(item: Entry) {
    await this.perform(async () => {
      const { url } = await this.api.get('/api/res/' + encodeURIComponent(item.id) + '/content', {
        ...this.credentials(), download: '1',
      });
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    });
  }

  shareUrl(share: Share) {
    return window.location.origin + this.router.serializeUrl(this.router.createUrlTree(['/share', share.token]));
  }

  async copyShare(share: Share) {
    const url = this.shareUrl(share);
    try {
      await navigator.clipboard.writeText(url);
      this.notice = '已复制分享链接';
    } catch {
      this.notice = url;
    }
  }

  async createShare(item: Entry) {
    await this.perform(async () => {
      const share: Share = await this.api.post('/api/shares/', { res_str_id: item.id });
      await this.showShares();
      await this.copyShare(share);
    });
  }

  async revokeShare(share: Share) {
    if (!window.confirm('撤销后，通过这条链接访问的访客将无法继续浏览。确定撤销？')) return;
    await this.perform(async () => {
      await this.api.del('/api/shares/' + share.token);
      this.shares = this.shares.filter(item => item.token !== share.token);
      this.notice = '分享链接已撤销';
    });
  }

  edit(mode: 'folder' | 'link' | 'rename', item?: Entry) {
    this.deleteTarget = null;
    this.editor = mode;
    this.renameTarget = item || null;
    this.draft = item?.name || '';
    this.linkUrl = '';
    this.operationError = '';
    requestAnimationFrame(() => {
      const input = document.getElementById(mode === 'rename' ? 'file-draft' : 'new-resource-name') as HTMLInputElement | null;
      input?.focus();
      if (mode === 'rename') input?.select();
    });
  }

  cancelEdit() {
    this.editor = null;
    this.renameTarget = null;
    this.operationError = '';
  }

  async saveEdit() {
    const item = this.renameTarget;
    const mode = this.editor;
    const value = this.draft.trim();
    let link = this.linkUrl.trim();
    if (!mode || !value || !this.data?.can_manage) return;
    if (mode === 'link') {
      try {
        const url = new URL(link);
        if (!/^https?:\/\//i.test(link) || !url.hostname || url.href.length > 1024) throw new Error();
        link = url.href;
      } catch {
        this.operationError = '请输入有效的 HTTP 或 HTTPS 链接。';
        document.getElementById('new-link-url')?.focus();
        return;
      }
    }
    await this.perform(async () => {
      if (mode === 'folder') {
        await this.resources.create_folder(this.data.resource.id, { folder_name: value });
      } else if (mode === 'link') {
        await this.resources.create_link(this.data.resource.id, { link_name: value, link });
      } else {
        await this.api.put('/api/res/' + encodeURIComponent(item.id), { rname: value });
        item.name = value;
      }
      this.cancelEdit();
      if (mode !== 'rename') {
        clearTimeout(this.searchTimer);
        this.query = '';
      }
      this.notice = mode === 'link' ? '已新建链接「' + value + '」' : mode === 'folder' ? '已新建文件夹「' + value + '」' : '已重命名';
      await this.load();
    }, true);
  }

  confirmDelete(item: Entry) {
    this.cancelEdit();
    this.deleteTarget = item;
  }

  async remove() {
    const item = this.deleteTarget;
    if (!item) return;
    await this.perform(async () => {
      await this.resources.delete_res(item.id);
      const current = this.data.resource.id === item.id;
      const parent = this.data.breadcrumbs.at(-2);
      this.closeInspector();
      if (current && parent) this.go(parent.id);
      else await this.load();
      this.notice = '已删除';
    }, true);
  }

  beginMove(item: Entry) {
    this.cancelEdit();
    this.deleteTarget = null;
    this.cut = item;
    const current = this.data.resource.id === item.id;
    this.cutParentId = current ? this.data.breadcrumbs.at(-2)?.id || '' : item.location ? '' : this.data.resource.id;
    if (!this.data.resource.folder && this.cutParentId) this.go(this.cutParentId);
  }

  cancelMove() {
    this.cut = null;
    this.cutParentId = '';
    this.operationError = '';
  }

  get canPaste() {
    return this.cut && this.data?.can_manage && this.data.resource.folder &&
      this.cutParentId !== this.data.resource.id && !this.data.breadcrumbs.some(part => part.id === this.cut.id);
  }

  get moveHint() {
    if (this.cutParentId === this.data.resource.id) return '资源已在此目录，请选择其他目录。';
    if (!this.canPaste) return '不能移入自身或子目录，请选择其他目录。';
    return '移动后，资源会按目标目录的分享范围访问。';
  }

  async paste() {
    if (!this.canPaste) return;
    const item = this.cut;
    await this.perform(async () => {
      await this.api.put('/api/res/' + encodeURIComponent(item.id), { parent_str_id: this.data.resource.id });
      this.cancelMove();
      this.selected = null;
      this.notice = '已移动「' + item.name + '」';
      await this.load();
    }, true);
  }

  async upload(input: HTMLInputElement) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length || !this.data?.resource.folder) return;
    const root = this.data.resource.id;
    await this.perform(async () => {
      const folders = new Map<string, string>([['', root]]);
      let uploaded = 0;
      try {
        for (const file of files) {
          const segments = file.webkitRelativePath.split('/').slice(0, -1);
          let path = '';
          for (const segment of segments) {
            const next = path ? path + '/' + segment : segment;
            if (!folders.has(next)) {
              const folder = await this.resources.create_folder(folders.get(path), { folder_name: segment });
              folders.set(next, folder.res_str_id);
            }
            path = next;
          }
          this.notice = '上传 ' + (uploaded + 1) + ' / ' + files.length + ' · ' + file.name;
          const token = await this.resources.get_upload_token(folders.get(path), { filename: file.name });
          await this.api.api_upload_file(token.key, token.upload_token, file, null);
          uploaded++;
        }
      } finally {
        await this.load();
      }
      this.notice = '已上传 ' + uploaded + ' 个文件';
    });
  }

  private async perform(action: () => Promise<void>, localError = false) {
    if (this.busy) return;
    this.busy = true;
    this.notice = '';
    this.operationError = '';
    try {
      await action();
    } catch (error) {
      const message = this.message(error, '操作失败，请重试。');
      if (localError) this.operationError = message;
      else this.notice = message;
    } finally {
      this.busy = false;
    }
  }

  setSort(column: 'name' | 'created_at' | 'size') {
    this.ascending = this.sort === column ? !this.ascending : true;
    this.sort = column;
  }

  get entries() {
    const direction = this.ascending ? 1 : -1;
    return [...(this.data?.entries || [])].sort((a, b) => {
      if (a.folder !== b.folder) return a.folder ? -1 : 1;
      if (this.sort === 'size') return (a.size - b.size) * direction;
      return a[this.sort].localeCompare(b[this.sort], 'zh-CN', { numeric: true }) * direction;
    });
  }

  get detail() {
    if (!this.selected) return null;
    return this.selected.id === this.data?.resource.id ? this.data.resource : this.selected;
  }

  get previewActive() {
    return !!(this.preview || this.previewLoading || this.previewError);
  }

  type(item: Entry) {
    return FILE_TYPES[this.iconType(item)].label;
  }

  iconType(item: Entry) {
    if (item.folder) return 'folder';
    if (item.preview === 'link') return 'link';
    const extension = item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : '';
    return TYPE_BY_EXTENSION.get(extension) || item.preview || 'file';
  }

  setView(view: 'list' | 'grid') {
    this.view = view;
    localStorage.setItem('disk.directory-view', view);
  }

  pdfUrl(item: Entry) {
    const path = '/api/res/' + encodeURIComponent(item.id) + '/pdf';
    return this.api.fillUrl(this.shareToken ? path + '?share=' + encodeURIComponent(this.shareToken) : path);
  }

  size(item: Entry) {
    if (item.folder || item.preview === 'link') return '—';
    if (item.size < 1024) return item.size + ' B';
    if (item.size < 1024 ** 2) return (item.size / 1024).toFixed(1) + ' KB';
    if (item.size < 1024 ** 3) return (item.size / 1024 ** 2).toFixed(1) + ' MB';
    return (item.size / 1024 ** 3).toFixed(1) + ' GB';
  }

  byId(_index: number, entry: Entry) {
    return entry.id;
  }

  login() {
    void this.router.navigate(['/'], { queryParams: { next: this.router.url } });
  }
}
