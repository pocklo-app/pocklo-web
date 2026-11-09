import { localDrop, UploadEntry } from './local-upload';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { BaseService } from '../../services/base.service';
import { ResourceService } from '../../services/resource.service';
import type { FinderWindowLocation } from './workspace-desktop.component';
import { FINDER_DRAG_TYPE, FinderTree } from './finder-tree';
import { renderShareQr } from './share-qr';
import { UserService } from '../../services/user.service';

export interface Entry {
  id: string;
  name: string;
  folder: boolean;
  preview: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'text' | 'link' | null;
  size: number;
  created_at: string;
  thumbnail: string | null;
  location?: string;
}

type FinderView = 'grid' | 'list' | 'columns' | 'gallery';
type FolderColumn = { id: string; name: string; entries: Entry[]; selectedId?: string; error?: boolean; pending?: boolean };

const FINDER_VIEWS: { id: FinderView; name: string }[] = [
  { id: 'grid', name: '图标' }, { id: 'list', name: '列表' },
  { id: 'columns', name: '分栏' }, { id: 'gallery', name: '连廊' },
];

export interface Workspace {
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
  hostname?: string;
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
export class WorkspaceComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() windowId = 0;
  @Input() windowStart?: FinderWindowLocation;
  @Input() canCloseWindow = false;
  @Input() canOpenWindow = true;
  @Input() set foreground(value: boolean) {
    const raised = value && !this.active;
    this.active = value;
    if (raised && this.data && this.section === 'files' && !this.busy && !this.editor && !this.modalItem) void this.load(true);
  }
  @Output() newWindow = new EventEmitter<FinderWindowLocation>();
  @Output() closeWindow = new EventEmitter<void>();
  @ViewChild('createDialog', { static: true }) private createDialog: ElementRef<HTMLDialogElement>;
  @ViewChild('shareDialog', { static: true }) private shareDialog: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog', { static: true }) private deleteDialog: ElementRef<HTMLDialogElement>;
  deleteProgress?: { total: number; completed: number; name: string };
  deleteError = '';
  get treeEditing() { return this.tree.editingStructure; }
  createdShare: Share | null = null;
  shareQr = '';
  shareQrError = false;
  shareError = '';
  shareFeedback = '';
  private active = true;
  private toastTimer: ReturnType<typeof setTimeout>;
  private toast = '';
  private directoryPending = false;

  get notice() { return this.toast; }
  set notice(value: string) {
    clearTimeout(this.toastTimer);
    this.toast = value;
    if (value) this.toastTimer = setTimeout(() => this.toast = '', 4500);
  }

  controlId(name: string) { return name + '-' + this.windowId; }
  private findControl<T extends HTMLElement>(name: string) {
    return this.host.nativeElement.querySelector<T>('#' + CSS.escape(this.controlId(name)));
  }

  @ViewChild('previewDialog', { static: true }) private previewDialog: ElementRef<HTMLDialogElement>;
  @ViewChild('infoDialog', { static: true }) private infoDialog: ElementRef<HTMLDialogElement>;
  infoItem: Entry | null = null;

  data: Workspace | null = null;
  selected: Entry | null = null;
  modalItem: Entry | null = null;
  preview: Preview | null = null;
  shares: Share[] = [];
  shareToken = '';
  resourceId = '';
  query = '';
  section: 'files' | 'shares' | 'account' = 'files';
  loading = true;
  previewLoading = false;
  busy = false;
  error = '';
  previewError = '';
  editor: 'folder' | 'link' | 'rename' | null = null;
  draft = '';
  linkUrl = '';
  operationError = '';
  get moveItems() { return this.tree.clipboard?.items ?? []; }
  get showMoveBar() { return !!this.tree.clipboard?.showBar; }
  marquee: { left: number; top: number; width: number; height: number } | null = null;
  private marqueeStart: { x: number; y: number; base: Entry[] } | null = null;
  private suppressBlankClick = false;
  selectedIds = new Set<string>();
  context: { x: number; y: number; trigger: HTMLElement | null } | null = null;
  get dropTarget() {
    const target = this.tree.dropTarget;
    return target?.windowId === this.windowId ? target : undefined;
  }
  quickItems: Entry[] = [];
  quickIndex = 0;
  private selectionAnchor = '';
  private selectionItems: Entry[] = [];
  deleteTarget: Entry | null = null;
  sort: 'name' | 'created_at' | 'size' = 'name';
  ascending = true;
  readonly views = FINDER_VIEWS;
  view: FinderView = FINDER_VIEWS.find(mode => mode.id === localStorage.getItem('disk.directory-view'))?.id || 'list';
  columns: FolderColumn[] = [];
  columnLoading = false;
  showDetails = false;
  showSearch = false;
  menuOpen = false;
  private columnRequest = 0;
  private visits: string[] = [];
  private visitIndex = -1;
  private historyScope = '';
  private pendingColumnFile: { folder: string; id: string };

  private routeSubscription: Subscription;
  private treeSubscription: Subscription;
  private resizeObserver: ResizeObserver;
  private searchTimer: ReturnType<typeof setTimeout>;
  private requestNumber = 0;
  private previewNumber = 0;
  private renameTarget: Entry | null = null;
  private previewOrigin: { trigger: HTMLElement | null; x: number; y: number; overflow: string };

  constructor(
    private host: ElementRef<HTMLElement>,
    private route: ActivatedRoute,
    private router: Router,
    private api: BaseService,
    private resources: ResourceService,
    private tree: FinderTree,
    public user: UserService,
  ) {}

  ngOnInit() {
    this.treeSubscription = this.tree.changed.subscribe(removed => {
      this.columnRequest++;
      if (this.section === 'files') {
        clearTimeout(this.searchTimer);
        if (removed?.has(this.data?.resource.id)) {
          const parent = [...this.data.breadcrumbs].reverse().find(part => !removed.has(part.id));
          if (parent) {
            this.go(parent.id);
            return;
          }
        }
        void this.load(!!this.data);
      }
    });
    if (this.windowStart) {
      this.navigateFolder(this.windowStart.resource, this.windowStart.share);
      return;
    }
    let routeKey: string;
    const sync = () => {
      const share = this.route.snapshot.paramMap.get('token') || '';
      const id = (share ? this.route.snapshot.queryParamMap.get('folder') : this.route.snapshot.paramMap.get('res_str_id')) || '';
      const settings = this.route.snapshot.queryParamMap.get('settings') === '1';
      const key = JSON.stringify([share, id, settings]);
      if (key === routeKey) return;
      routeKey = key;
      this.navigateFolder(id, share);
      if (settings) {
        this.section = 'account';
        const message = this.router.getCurrentNavigation()?.extras.state?.['accountMessage'];
        if (message) this.notice = message;
      }
    };
    sync();
    this.routeSubscription = this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(sync);
  }

  private navigateFolder(id: string, share = this.shareToken, record = true) {
    const scope = share || 'owned';
    if (scope !== this.historyScope) {
      this.historyScope = scope;
      this.columns = [];
      this.visits = [];
      this.visitIndex = -1;
    }
    if (record || this.visitIndex === -1) this.recordVisit(id);
    if (scope !== 'owned') this.cancelMove();
    clearTimeout(this.searchTimer);
    this.columnRequest++;
    const previous = scope === (this.shareToken || 'owned') && !this.query.trim() ? this.data : null;
    const known = this.tree.cached(share, id)?.data;
    const folder = this.columns.flatMap(column => column.entries).find(item => item.id === id) ||
      previous?.entries.find(item => item.id === id);
    const parent = this.columns.find(column => column.entries.some(item => item.id === id));
    const parentIndex = previous?.breadcrumbs.findIndex(part => part.id === parent?.id) ?? -1;
    this.shareToken = share;
    this.resourceId = id;
    this.section = 'files';
    this.query = '';
    this.menuOpen = false;
    this.closeInspector();
    this.directoryPending = false;
    if (known) {
      this.data = known;
      this.syncView();
    } else if (folder?.folder && previous && this.visibleView === 'columns') {
      const ancestors = parentIndex >= 0 ? previous.breadcrumbs.slice(0, parentIndex + 1) : previous.breadcrumbs;
      this.data = { ...previous, resource: folder, entries: [], can_delete: previous.can_manage, has_more: false,
        breadcrumbs: [...ancestors, { id: folder.id, name: folder.name }] };
      this.directoryPending = true;
      this.syncView();
    } else this.data = null;
    void this.load(!!known || this.directoryPending);
  }

  openWindow(item?: Entry) {
    const resource = item || this.data?.resource;
    if (!this.canOpenWindow) this.notice = '最多可打开 4 个窗口';
    else if (resource) this.newWindow.emit({ resource: resource.id, share: this.shareToken });
    this.dismissContext();
    this.menuOpen = false;
  }

  showAccount() {
    if (this.busy) return;
    clearTimeout(this.searchTimer);
    this.requestNumber++;
    this.columnRequest++;
    this.closeInspector();
    this.error = '';
    this.loading = false;
    this.section = 'account';
  }

  private recordVisit(id: string) {
    this.visits = [...this.visits.slice(0, this.visitIndex + 1), id];
    this.visitIndex = this.visits.length - 1;
  }

  get canGoBack() { return this.visitIndex > 0; }
  get canGoForward() { return this.visitIndex < this.visits.length - 1; }

  stepHistory(direction: -1 | 1) {
    if (this.section !== 'files') {
      if (direction === -1) this.showFiles();
      return;
    }
    if (this.busy || (direction === -1 ? !this.canGoBack : !this.canGoForward)) return;
    this.visitIndex += direction;
    this.navigateFolder(this.visits[this.visitIndex], this.shareToken, false);
  }

  ngAfterViewInit() {
    let width = this.host.nativeElement.clientWidth;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      this.revealColumn();
    });
    this.resizeObserver.observe(this.host.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver.disconnect();
    this.closePreview();
    this.routeSubscription?.unsubscribe();
    this.treeSubscription.unsubscribe();
    this.endDrag();
    clearTimeout(this.toastTimer);
    clearTimeout(this.searchTimer);
    this.requestNumber++;
    this.previewNumber++;
    this.columnRequest++;
  }

  private credentials() {
    if (this.shareToken) return { share: this.shareToken };
    return {};
  }

  private message(error: any, fallback: string) {
    return error?.error?.msg || (typeof error === 'string' ? error : error instanceof Error ? error.message : fallback);
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

  private fetchFolder(id: string, query = '') {
    if (query) return this.getWorkspace(id, query);
    return this.tree.fetch(this.shareToken, id, () => this.getWorkspace(id));
  }

  warmFolder(item: Entry) {
    if (item.folder && this.visibleView === 'columns' && !this.tree.cached(this.shareToken, item.id)) {
      void this.fetchFolder(item.id).catch(() => {});
    }
  }

  private canUseStaleListing(error: any) {
    return error?.status === 0 || error?.status >= 500;
  }

  async load(background = false) {
    const request = ++this.requestNumber;
    this.loading = !background;
    const provisional = this.directoryPending;
    this.error = '';
    try {
      const id = this.resourceId;
      const query = this.query.trim();
      const data = await this.fetchFolder(id, query);
      if (request !== this.requestNumber) return;
      this.data = data;
      this.directoryPending = false;
      if (data.resource.folder) {
        this.syncView();
      } else {
        this.selected = data.resource;
        void this.loadPreview(data.resource);
      }
    } catch (error) {
      if (request !== this.requestNumber) return;
      this.directoryPending = false;
      if (provisional && this.canUseStaleListing(error)) {
        this.columns = this.columns.map(column => column.id === this.resourceId ? { ...column, pending: false, error: true } : column);
        this.columnLoading = false;
      } else if (background && this.data && this.canUseStaleListing(error)) {
        this.notice = '无法刷新，正在显示上次读取的内容。';
      } else {
        this.tree.forget(this.shareToken, this.resourceId);
        if (this.data?.resource.id) this.tree.forget(this.shareToken, this.data.resource.id);
        this.data = null;
        this.columns = [];
        this.error = this.message(error, '无法连接到小兜，请稍后重试。');
      }
    } finally {
      if (request === this.requestNumber) this.loading = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  focusSearch(event: KeyboardEvent) {
    if (!this.active || event.defaultPrevented || this.busy || this.infoItem || this.createdShare || this.createDialog.nativeElement.open || this.deleteDialog.nativeElement.open) return;
    const editable = (event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
    if (this.modalItem) {
      if (editable) return;
      if (event.key === ' ' && !(event.target as HTMLElement)?.closest('button, a, video, audio')) this.closePreview(event);
      if (this.quickItems.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
          !(event.target as HTMLElement)?.closest('video, audio')) {
        event.preventDefault();
        this.stepQuick(event.key === 'ArrowLeft' ? -1 : 1);
      }
      return;
    }
    if (event.key === 'Escape') {
      if (this.context) this.dismissContext(true);
      else if (this.menuOpen) this.menuOpen = false;
      else if ((event.target as HTMLElement)?.id?.startsWith('drive-search')) this.closeSearch();
      else if (this.editor) this.cancelEdit();
      else if (this.moveItems.length) this.cancelMove();
      else if (this.selected && this.data?.resource.folder) this.closeInspector();
      return;
    }
    if (editable || this.context || this.section !== 'files' || !this.data?.resource.folder) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === 'n' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      this.openWindow();
      return;
    }
    const key = event.key.toLowerCase();
    if (command && key === 'a' && !event.altKey) {
      event.preventDefault();
      const items = this.selectionItems.length ? this.selectionItems : this.entries;
      this.setSelection(items, this.selected && items.includes(this.selected) ? this.selected : items[0]);
      return;
    }
    if (command && key === 'i' && !event.altKey && this.selection.length === 1 && this.selected) {
      event.preventDefault();
      this.openInfo(this.selected);
      return;
    }
    if (command && key === 'c' && !event.altKey && this.data.can_manage && this.selection.length &&
        !window.getSelection()?.toString()) {
      event.preventDefault();
      this.beginMove(this.selected, false);
      return;
    }
    if (command && event.altKey && (event.code === 'KeyV' || key === 'v') && this.canPaste) {
      event.preventDefault();
      void this.paste();
      return;
    }
    if (event.key === ' ' && this.selected && !command &&
        !(event.target as HTMLElement)?.closest('button, a, video, audio')) {
      event.preventDefault();
      this.openPreview(this.selected, event);
      return;
    }
    if (key === '/' && !command && !event.altKey) {
      event.preventDefault();
      this.openSearch();
    }
  }

  updateQuery(value: string) {
    this.query = value;
    this.requestNumber++;
    this.columnRequest++;
    this.loading = true;
    this.closeInspector();
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  go(id: string) {
    if (id !== this.data?.resource.id) this.navigateFolder(id);
  }

  showFiles() {
    const root = this.data?.breadcrumbs[0]?.id || (!this.shareToken ? this.user.user?.rootRes : '');
    if (this.section === 'files' && root && root !== this.data?.resource.id) {
      this.go(root);
      return;
    }
    this.section = 'files';
    this.error = '';
    void this.load(!!this.data);
  }

  async showShares() {
    clearTimeout(this.searchTimer);
    const request = ++this.requestNumber;
    this.section = 'shares';
    this.columnRequest++;
    this.menuOpen = false;
    this.closeInspector();
    this.error = '';
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

  get selection() {
    const items = this.selectionItems.filter(item => this.selectedIds.has(item.id));
    return items.length ? items : this.selected ? [this.selected] : [];
  }

  isSelected(item: Entry) {
    return this.selectedIds.has(item.id) || this.selected?.id === item.id;
  }

  private setSelection(items: Entry[], active?: Entry, group = items) {
    this.dismissContext();
    this.cancelEdit();
    this.selectedIds = new Set(items.map(item => item.id));
    this.selectionItems = group;
    this.selected = active || null;
    this.resetPreview();
    if (this.usesInlinePreview && items.length === 1 && active && !active.folder) void this.loadPreview(active);
  }

  select(item: Entry, event?: MouseEvent | KeyboardEvent, group = this.entries) {
    if (this.busy) return;
    const sameGroup = this.selectionItems === group;
    if (event?.shiftKey && sameGroup && this.selectionAnchor) {
      const anchor = group.findIndex(entry => entry.id === this.selectionAnchor);
      const index = group.findIndex(entry => entry.id === item.id);
      if (anchor >= 0 && index >= 0) {
        this.setSelection(group.slice(Math.min(anchor, index), Math.max(anchor, index) + 1), item, group);
        return;
      }
    }
    this.selectionAnchor = item.id;
    if ((event?.metaKey || (event?.ctrlKey && !/Mac/.test(navigator.platform))) && sameGroup) {
      const items = this.isSelected(item) ? this.selection.filter(entry => entry.id !== item.id) : [...this.selection, item];
      this.setSelection(items, items.includes(item) ? item : items.at(-1), group);
    } else if (!this.isSelected(item) || this.selection.length !== 1 || !sameGroup) {
      this.setSelection([item], item, group);
    }
  }

  showContext(event: MouseEvent, item?: Entry, group = this.entries) {
    event.preventDefault();
    event.stopPropagation();
    if (this.busy || !this.data?.resource.folder) return;
    if (item && !this.isSelected(item)) this.select(item, undefined, group);
    if (!item && event.type === 'contextmenu') this.closeInspector();
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this.context = { x: event.type === 'contextmenu' ? event.clientX : rect.left,
      y: event.type === 'contextmenu' ? event.clientY : rect.bottom,
      trigger: trigger.closest('button') || trigger.querySelector('button') };
    requestAnimationFrame(() => {
      const menu = this.findControl('finder-context');
      if (!menu || !this.context) return;
      this.context = { ...this.context,
        x: Math.max(6, Math.min(this.context.x, innerWidth - menu.offsetWidth - 6)),
        y: Math.max(6, Math.min(this.context.y, innerHeight - menu.offsetHeight - 6)) };
      menu.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
    });
  }

  dismissContext(restore = false) {
    if (restore) this.context?.trigger?.focus({ preventScroll: true });
    this.context = null;
  }

  @HostListener('document:pointerdown', ['$event'])
  dismissMenus(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (!this.host.nativeElement.contains(target) || !target.closest('.finder-context')) this.dismissContext();
    if (!target.closest('.create-menu')) this.menuOpen = false;
  }

  menuKeys(event: KeyboardEvent) {
    const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      this.dismissContext(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }

  openInfo(item: Entry) {
    this.dismissContext(true);
    this.infoItem = item;
    this.infoDialog.nativeElement.showModal();
  }

  closeInfo() {
    this.infoDialog.nativeElement.close();
    this.infoItem = null;
  }

  enterItem(event: KeyboardEvent, item: Entry) {
    if (this.busy) return;
    event.preventDefault();
    if (this.data?.can_manage && !event.metaKey && !event.ctrlKey) {
      if (!this.isSelected(item)) this.select(item);
      if (this.selection.length === 1) this.edit('rename', item);
    } else this.openItem(item, event);
  }

  startMarquee(event: PointerEvent) {
    this.suppressBlankClick = false;
    if (this.visibleView !== 'grid' || this.busy || event.pointerType !== 'mouse' || event.button !== 0 ||
        event.target !== event.currentTarget) return;
    this.marqueeStart = { x: event.clientX, y: event.clientY, base: event.metaKey || event.shiftKey ? this.selection : [] };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  updateMarquee(event: PointerEvent) {
    if (!this.marqueeStart) return;
    const { x, y, base } = this.marqueeStart;
    if (!this.marquee && Math.hypot(event.clientX - x, event.clientY - y) < 5) return;
    const left = Math.min(x, event.clientX);
    const top = Math.min(y, event.clientY);
    const right = Math.max(x, event.clientX);
    const bottom = Math.max(y, event.clientY);
    this.marquee = { left, top, width: right - left, height: bottom - top };
    const ids = new Set(base.map(item => item.id));
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-finder-item]').forEach(item => {
      const rect = item.getBoundingClientRect();
      if (left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top) ids.add(item.dataset.finderItem);
    });
    const items = this.entries.filter(item => ids.has(item.id));
    this.setSelection(items, items.at(-1), this.entries);
  }

  endMarquee() {
    this.suppressBlankClick = !!this.marquee;
    this.marquee = null;
    this.marqueeStart = null;
  }

  blankClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !this.busy && !this.suppressBlankClick) this.closeInspector();
    this.suppressBlankClick = false;
  }

  openItem(item: Entry, event: Event) {
    event.preventDefault();
    if (this.busy) return;
    if (item.folder) this.go(item.id);
    else this.openPreview(item, event);
  }

  openPreview(item: Entry, event: Event) {
    const dialog = this.previewDialog.nativeElement;
    if (dialog.open) return;
    const candidates = this.isSelected(item) && this.selection.length > 1 ? this.selection : [item];
    this.quickItems = candidates;
    this.quickIndex = Math.max(0, candidates.findIndex(entry => entry.id === item.id));
    this.previewOrigin = {
      trigger: this.context?.trigger || (event.currentTarget as HTMLElement)?.closest('button') || document.activeElement as HTMLElement,
      x: window.scrollX,
      y: window.scrollY,
      overflow: document.documentElement.style.overflow,
    };
    this.modalItem = item;
    this.dismissContext();
    this.resetPreview();
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    if (!item.folder) void this.loadPreview(item);
  }

  stepQuick(direction: -1 | 1) {
    const item = this.quickItems[this.quickIndex + direction];
    if (!item) return;
    this.quickIndex += direction;
    this.modalItem = item;
    this.resetPreview();
    if (!item.folder) void this.loadPreview(item);
  }

  closePreview(event?: Event) {
    event?.preventDefault();
    if (!this.modalItem) return;
    this.previewDialog.nativeElement.close();
    this.modalItem = null;
    this.quickItems = [];
    this.resetPreview();
    const { trigger, x, y, overflow } = this.previewOrigin;
    document.documentElement.style.overflow = overflow;
    trigger?.focus({ preventScroll: true });
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    if ((this.usesInlinePreview || !this.data?.resource.folder) && this.selected && !this.selected.folder) {
      void this.loadPreview(this.selected);
    }
  }

  closeInspector() {
    if (this.infoItem) this.closeInfo();
    if (this.createdShare) this.closeShare();
    this.selected = null;
    this.selectedIds = new Set();
    this.selectionItems = [];
    this.selectionAnchor = '';
    this.dismissContext();
    this.closePreview();
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
      const preview: Preview = await this.api.get('/api/res/' + encodeURIComponent(item.id) + '/content', this.credentials());
      if (request !== this.previewNumber) return;
      if (preview.kind === 'link') {
        const url = new URL(preview.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('此链接的地址无法打开。');
        preview.hostname = url.host;
      }
      this.preview = preview;
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
      if (this.createdShare) this.shareFeedback = '已复制分享链接';
      else this.notice = '已复制分享链接';
    } catch {
      if (this.createdShare) this.shareError = '未能自动复制，请选中链接手动复制。';
      else this.notice = url;
    }
  }

  async createShare(item: Entry) {
    await this.perform(async () => {
      const share: Share = await this.api.post('/api/shares/', { res_str_id: item.id });
      this.shares = [share, ...this.shares.filter(item => item.token !== share.token)];
      this.openShare(share);
    });
  }

  openShare(share: Share) {
    this.createdShare = share;
    this.shareQr = this.shareError = this.shareFeedback = '';
    this.shareQrError = false;
    this.shareDialog.nativeElement.showModal();
    void renderShareQr(this.shareUrl(share)).then(image => {
      if (this.createdShare === share) this.shareQr = image;
    }, () => {
      if (this.createdShare === share) this.shareQrError = true;
    });
  }

  closeShare() {
    this.shareDialog.nativeElement.close();
    this.createdShare = null;
    this.shareQr = '';
    this.shareError = this.shareFeedback = '';
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
    this.editor = mode;
    this.renameTarget = item || null;
    this.draft = item?.name || '';
    this.linkUrl = '';
    this.operationError = '';
    if (mode !== 'rename') this.createDialog.nativeElement.showModal();
    requestAnimationFrame(() => {
      const input = this.findControl<HTMLInputElement>(mode === 'rename' ? 'file-draft' : 'new-resource-name');
      input?.focus();
      if (mode === 'rename') input?.select();
    });
  }

  cancelEdit() {
    if (this.createDialog.nativeElement.open) this.createDialog.nativeElement.close();
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
        this.findControl('new-link-url')?.focus();
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
      }
      this.cancelEdit();
      if (mode !== 'rename') {
        clearTimeout(this.searchTimer);
        this.query = '';
      }
      this.notice = mode === 'link' ? '已新建链接「' + value + '」' : mode === 'folder' ? '已新建文件夹「' + value + '」' : '已重命名';
      this.tree.invalidate();
    }, true);
  }

  confirmDelete(item: Entry) {
    if (this.busy || !this.data?.can_manage) return;
    this.cancelEdit();
    this.deleteTarget = item;
    this.deleteError = '';
    this.deleteProgress = undefined;
    this.deleteDialog.nativeElement.showModal();
    requestAnimationFrame(() => this.findControl('delete-cancel')?.focus());
  }

  closeDelete() {
    if (this.busy) return;
    this.deleteDialog.nativeElement.close();
    this.deleteTarget = null;
    this.deleteProgress = undefined;
  }

  private async deletionOrder(root: Entry) {
    const order: Entry[] = [];
    const pending = [root];
    const seen = new Set<string>();
    while (pending.length) {
      const item = pending.pop();
      if (seen.has(item.id)) throw new Error('目录结构已变化，请刷新后重试。');
      seen.add(item.id);
      order.push(item);
      if (item.folder) {
        const { entries } = await this.getWorkspace(item.id);
        for (const child of entries) pending.push(child);
      }
    }
    return order.reverse();
  }

  async remove() {
    const item = this.deleteTarget;
    if (!item || this.busy || this.tree.editingStructure) return;
    this.tree.editingStructure = true;
    this.busy = true;
    this.deleteError = '';
    this.deleteProgress = { total: 0, completed: 0, name: item.name };
    const removed = new Set<string>();
    try {
      const order = await this.deletionOrder(item);
      this.deleteProgress.total = order.length;
      for (const entry of order) {
        this.deleteProgress.name = entry.name;
        await this.resources.delete_res(entry.id, item.folder ? item.id : undefined);
        removed.add(entry.id);
        this.deleteProgress.completed++;
      }
      this.notice = item.folder ? '已删除 ' + removed.size + ' 项' : '已删除「' + item.name + '」';
    } catch (error) {
      const message = this.message(error, '删除失败，请重试。');
      this.deleteError = removed.size ? '已删除 ' + removed.size + ' 项。' + message : message;
    } finally {
      this.busy = false;
      this.tree.editingStructure = false;
      if (!this.deleteError) this.closeDelete();
      if (removed.size) {
        this.tree.clearClipboardItems([...removed]);
        this.tree.invalidate(removed);
      }
    }
  }

  beginMove(item: Entry, showBar = true) {
    if (!item || !this.data?.can_manage) return;
    this.cancelEdit();
    const source = this.originFolder(item);
    this.tree.clipboard = { items: this.isSelected(item) ? this.selection : [item], source, showBar };
    if (!this.data.resource.folder && source) this.go(source);
  }

  private originFolder(item: Entry) {
    const current = this.data.resource.id === item.id;
    const column = this.columns.find(folder => folder.entries === this.selectionItems);
    return current ? this.data.breadcrumbs.at(-2)?.id || '' : this.query.trim() ? '' : column?.id || this.data.resource.id;
  }

  cancelMove() {
    this.tree.clipboard = undefined;
    this.operationError = '';
  }

  private acceptsMove(items: Entry[], destination: string, source: string) {
    if (!items.length || !this.data?.can_manage || this.busy || this.tree.editingStructure || destination === source) return false;
    const path = this.data.breadcrumbs;
    const destinationIndex = path.findIndex(folder => folder.id === destination);
    const ancestors = destinationIndex < 0 ? path : path.slice(0, destinationIndex + 1);
    return !items.some(item => item.id === destination || ancestors.some(folder => folder.id === item.id));
  }

  get canPaste() {
    return this.data?.resource.folder && this.acceptsMove(this.moveItems, this.data.resource.id, this.tree.clipboard?.source ?? '');
  }

  async paste() {
    if (this.canPaste) await this.moveTo(this.moveItems, this.data.resource.id);
  }

  startDrag(event: DragEvent, item: Entry, group = this.entries, source?: string) {
    if (!event.dataTransfer || this.busy || !this.data?.can_manage ||
        (item.id === this.data.resource.id && !this.data.can_delete)) {
      event.preventDefault();
      return;
    }
    if (!this.selectedIds.has(item.id) || this.selectionItems !== group) this.select(item, undefined, group);
    const items = this.selection;
    this.tree.drag = { items, source: source ?? this.originFolder(item), windowId: this.windowId };
    this.tree.dropTarget = undefined;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(FINDER_DRAG_TYPE, 'move');
    this.setDragImage(event, item, items.length);
    this.dismissContext();
  }

  private setDragImage(event: DragEvent, item: Entry, count: number) {
    const canvas = document.createElement('canvas');
    const height = 28;
    const icon = (event.currentTarget as HTMLElement).querySelector<HTMLImageElement>('.file-icon');
    const context = canvas.getContext('2d');
    if (!context) return;

    const font = '12px system-ui, sans-serif';
    context.font = font;
    const label = count > 1 ? count + ' 项' : item.name;
    const padding = icon?.naturalWidth ? 34 : 18;
    const width = Math.min(144, Math.ceil(context.measureText(label).width) + padding);
    const characters = Array.from(label);
    let text = label;
    while (context.measureText(text).width > width - padding) {
      characters.pop();
      text = characters.join('') + '…';
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#edf5ff';
    context.strokeStyle = '#a4c7f4';
    context.beginPath();
    context.roundRect(0.5, 0.5, width - 1, height - 1, 7);
    context.fill();
    context.stroke();
    if (icon?.naturalWidth) context.drawImage(icon, 7, 6, 16, 16);
    context.font = font;
    context.textBaseline = 'middle';
    context.fillStyle = '#18467d';
    context.fillText(text, padding - 9, height / 2);
    event.dataTransfer.setDragImage(canvas, 10, 10);
  }

  private destinationAt(event: DragEvent, fallback?: Entry) {
    const element = event.target as Element;
    const row = element.closest<HTMLElement>('[data-drop-folder]');
    const column = element.closest<HTMLElement>('[data-drop-directory]');
    if (row) return { id: row.dataset.dropFolder, name: row.dataset.dropName, row: true };
    if (column) return { id: column.dataset.dropDirectory, name: column.dataset.dropName, row: false };
    return fallback && { id: fallback.id, name: fallback.name, row: false };
  }

  private isLocalDrop(event: DragEvent) {
    return event.dataTransfer?.types.includes('Files');
  }

  @HostListener('window:dragover', ['$event'])
  @HostListener('window:drop', ['$event'])
  preventFileNavigation(event: DragEvent) {
    if (this.isLocalDrop(event)) event.preventDefault();
  }

  dragOver(event: DragEvent, fallback?: Entry) {
    const upload = this.isLocalDrop(event);
    const drag = this.tree.drag;
    if (!upload && (!drag || !event.dataTransfer?.types.includes(FINDER_DRAG_TYPE))) return;
    const target = this.destinationAt(event, fallback);
    if (!target || (upload ? !this.canUpload : !this.acceptsMove(drag.items, target.id, drag.source))) {
      this.clearDropTarget();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = upload ? 'copy' : 'move';
    this.tree.dropTarget = { ...target, upload, windowId: this.windowId };
  }

  private get canUpload() {
    return this.section === 'files' && this.data?.can_manage && !this.busy && !this.tree.editingStructure;
  }

  leaveDropZone(event: DragEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) this.clearDropTarget();
  }

  private clearDropTarget() {
    if (this.dropTarget) this.tree.dropTarget = undefined;
  }

  endDrag() {
    if (this.tree.drag?.windowId === this.windowId) {
      this.tree.drag = undefined;
      this.tree.dropTarget = undefined;
    } else this.clearDropTarget();
  }

  drop(event: DragEvent, fallback?: Entry) {
    const target = this.destinationAt(event, fallback);
    this.clearDropTarget();
    if (this.isLocalDrop(event)) {
      event.preventDefault();
      if (target && this.canUpload) void this.uploadEntries(target.id, localDrop(event.dataTransfer));
      return;
    }
    const drag = this.tree.drag;
    if (!drag || !target || !event.dataTransfer?.types.includes(FINDER_DRAG_TYPE)) return;
    if (!this.acceptsMove(drag.items, target.id, drag.source)) return;
    event.preventDefault();
    this.tree.drag = undefined;
    void this.moveTo(drag.items, target.id);
  }

  private async moveTo(items: Entry[], destination: string) {
    if (this.tree.editingStructure || this.busy) return;
    this.tree.editingStructure = true;
    try {
      await this.perform(async () => {
        const moved: string[] = [];
        try {
          for (const item of items) {
            await this.api.put('/api/res/' + encodeURIComponent(item.id), { parent_str_id: destination });
            moved.push(item.id);
          }
        } catch (error) {
          if (!moved.length) throw error;
          throw new Error('已移动 ' + moved.length + ' 项。' + this.message(error, '其余项目移动失败。'));
        } finally {
          if (moved.length) {
            this.tree.clearClipboardItems(moved);
            this.tree.invalidate();
          }
        }
        this.notice = '已移动 ' + moved.length + ' 项';
      });
    } finally {
      this.tree.editingStructure = false;
    }
  }

  upload(input: HTMLInputElement) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length || !this.canUpload || !this.data.resource.folder) return;
    void this.uploadEntries(this.data.resource.id, async () => files.map(file => ({
      path: file.webkitRelativePath.split('/').slice(0, -1), file,
    })));
  }

  private async uploadEntries(root: string, read: () => Promise<UploadEntry[]>) {
    await this.perform(async () => {
      this.notice = '正在读取本地项目…';
      const entries = await read();
      if (!entries.length) throw new Error('没有可上传的项目。');
      const folders = new Map<string, string>([['', root]]);
      const totalFiles = entries.filter(entry => entry.file).length;
      let uploaded = 0;
      try {
        for (const { path: segments, file } of entries) {
          let path = '';
          for (const segment of segments) {
            const next = path ? path + '/' + segment : segment;
            if (!folders.has(next)) {
              const folder = await this.resources.create_folder(folders.get(path), { folder_name: segment });
              folders.set(next, folder.res_str_id);
            }
            path = next;
          }
          if (file) {
            this.notice = '上传 ' + (uploaded + 1) + ' / ' + totalFiles + ' · ' + file.name;
            const token = await this.resources.get_upload_token(folders.get(path), { filename: file.name });
            await this.api.api_upload_file(token.key, token.upload_token, file, null);
            uploaded++;
          }
        }
      } catch (error) {
        const message = this.message(error, '上传失败，请重试。');
        const completed = uploaded + folders.size - 1;
        throw new Error(completed ? '已完成 ' + completed + ' 项。' + message : message);
      } finally {
        this.tree.invalidate();
      }
      const created = folders.size - 1;
      this.notice = created ? '已上传 ' + uploaded + ' 个文件，创建 ' + created + ' 个文件夹' : '已上传 ' + uploaded + ' 个文件';
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
    if (this.visibleView === 'columns' && this.data?.resource.folder) void this.loadColumns();
  }

  private sortedEntries: { source: Entry[]; key: string; items: Entry[] };

  get entries() {
    const source = this.data?.entries;
    if (!source) return [];
    const key = this.sort + ':' + this.ascending;
    if (this.sortedEntries?.source !== source || this.sortedEntries.key !== key) {
      this.sortedEntries = { source, key, items: this.sorted(source) };
    }
    return this.sortedEntries.items;
  }

  chooseSort(value: string) {
    const [column, order] = value.split(':');
    if (column !== 'name' && column !== 'created_at' && column !== 'size') return;
    this.sort = column;
    this.ascending = order === 'asc';
    if (this.visibleView === 'columns' && this.data?.resource.folder) void this.loadColumns();
  }

  private sorted(items: Entry[]) {
    const direction = this.ascending ? 1 : -1;
    return [...items].sort((a, b) => {
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

  setView(view: FinderView) {
    if (this.view === view) return;
    this.view = view;
    localStorage.setItem('disk.directory-view', view);
    if (this.data?.resource.folder) this.resetPreview();
    this.syncView();
    if (view === 'columns') this.revealColumn();
  }

  get usesInlinePreview() {
    return !!this.data?.resource.folder && (this.view === 'gallery' || (this.view === 'columns' && !this.query.trim()));
  }

  get visibleView(): FinderView {
    return this.view === 'columns' && this.query.trim() ? 'list' : this.view;
  }

  get galleryIndex() { return this.entries.findIndex(item => item.id === this.selected?.id); }

  openSearch() {
    const desktop = this.findControl('drive-search-desktop');
    if (desktop?.getClientRects().length) {
      desktop.focus();
      return;
    }
    this.showSearch = true;
    requestAnimationFrame(() => this.findControl('drive-search')?.focus());
  }

  closeSearch() {
    if (this.query) this.updateQuery('');
    this.showSearch = false;
  }

  private syncView() {
    if (this.section !== 'files' || !this.data?.resource.folder) return;
    const items = this.entries;
    if (this.pendingColumnFile?.folder === this.data.resource.id) {
      const pending = items.find(item => item.id === this.pendingColumnFile.id);
      this.pendingColumnFile = null;
      if (pending) this.selected = pending;
    }
    const browsingColumns = this.visibleView === 'columns';
    const current = this.data.resource;
    const selected = browsingColumns && this.selected?.id === current.id
      ? current : items.find(item => item.id === this.selected?.id);
    if (this.selected && !selected) this.closeInspector();
    else if (selected) {
      this.selected = selected;
      this.selectionItems = items;
      this.selectedIds = new Set(items.filter(item => this.selectedIds.has(item.id)).map(item => item.id));
    }
    if (browsingColumns) {
      if (!this.selected && this.data.breadcrumbs.length > 1) this.selected = current;
      void this.loadColumns();
    }
    if (this.view === 'gallery' && !this.selected && items.length) this.select(items[0]);
    else if (this.usesInlinePreview && this.selected && !this.selected.folder && !this.modalItem && !this.preview && !this.previewLoading) {
      void this.loadPreview(this.selected);
    }
  }

  private loadColumns() {
    const request = ++this.columnRequest;
    const data = this.data;
    const path = data.breadcrumbs.length ? data.breadcrumbs : [data.resource];
    const changedPath = this.columns.length !== path.length || path.some((folder, index) => this.columns[index]?.id !== folder.id);
    const existing = new Map(this.columns.map(column => [column.id, column]));
    this.columns = path.map((folder, index) => {
      if (index === path.length - 1) return { ...folder, entries: this.entries, pending: this.directoryPending };
      const cached = this.tree.cached(this.shareToken, folder.id);
      const old = existing.get(folder.id);
      return { ...folder, entries: cached ? this.sorted(cached.data.entries) : old?.entries || [],
        selectedId: path[index + 1].id, pending: !cached && !old?.entries.length };
    });
    this.columnLoading = this.directoryPending;
    for (const column of this.columns.slice(0, -1).filter(item => Date.now() - (this.tree.cached(this.shareToken, item.id)?.time ?? 0) > 15_000)) {
      void this.fetchFolder(column.id).then(listing => {
        if (request !== this.columnRequest) return;
        this.columns = this.columns.map(item => item.id === column.id
          ? { ...item, entries: this.sorted(listing.entries), pending: false } : item);
      }, error => {
        if (request !== this.columnRequest) return;
        const stale = this.canUseStaleListing(error);
        if (!stale) this.tree.forget(this.shareToken, column.id);
        this.columns = this.columns.map(item => item.id === column.id
          ? { ...item, entries: stale ? item.entries : [], error: true, pending: false } : item);
      });
    }
    if (changedPath) this.revealColumn();
  }

  @HostListener('window:resize')
  revealColumn() {
    if (this.section !== 'files' || this.visibleView !== 'columns') return;
    requestAnimationFrame(() => {
      const strip = this.findControl('finder-columns');
      if (strip) strip.scrollLeft = strip.scrollWidth;
    });
  }

  pickColumn(item: Entry, column: FolderColumn, event: MouseEvent) {
    if (this.busy) return;
    if (event.shiftKey || event.metaKey || (event.ctrlKey && !/Mac/.test(navigator.platform))) {
      this.select(item, event, column.entries);
      return;
    }
    if (item.folder) {
      if (item.id === this.data.resource.id) this.select(item);
      else this.go(item.id);
    } else if (column.id !== this.data.resource.id) {
      this.pendingColumnFile = { folder: column.id, id: item.id };
      this.go(column.id);
    } else {
      this.select(item, event, column.entries);
      this.revealColumn();
    }
  }

  pickGallery(item: Entry, event?: MouseEvent) {
    this.select(item, event);
    requestAnimationFrame(() => this.findControl('gallery-' + item.id)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }

  stepGallery(direction: -1 | 1) {
    const item = this.entries[this.galleryIndex + direction];
    if (item) this.pickGallery(item);
  }

  browseKeys(event: KeyboardEvent, item: Entry, items: Entry[], gallery = false) {
    if (this.busy) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowDown') {
      this.openItem(this.selected || item, event);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowUp') {
      const parent = this.data?.breadcrumbs.at(-2);
      if (parent) {
        event.preventDefault();
        this.go(parent.id);
      }
      return;
    }
    if (event.metaKey || event.altKey || (event.ctrlKey && event.key !== 'F10')) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      this.showContext(event as unknown as MouseEvent, item, items);
      return;
    }
    if (event.key === ' ') {
      this.openPreview(this.isSelected(item) && this.selected ? this.selected : item, event);
      event.preventDefault();
      return;
    }
    const button = event.currentTarget as HTMLElement;
    const group = button.closest<HTMLElement>('.file-entries, .gallery-strip, .column-entries');
    const grid = this.visibleView === 'grid' && group ? getComputedStyle(group).gridTemplateColumns.split(' ').length : 0;
    const directions = gallery ? { ArrowLeft: -1, ArrowRight: 1 } : grid
      ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -grid, ArrowDown: grid }
      : { ArrowUp: -1, ArrowDown: 1 };
    const offset = directions[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = items[items.findIndex(entry => entry.id === item.id) + offset];
    if (!next) return;
    if (gallery) this.pickGallery(next);
    else if (this.visibleView !== 'columns' || (!next.folder && items === this.columns.at(-1)?.entries)) {
      this.select(next, event, items);
    }
    group?.querySelectorAll<HTMLButtonElement>('button[data-finder-item]')
      .forEach(button => { if (button.dataset.finderItem === next.id) button.focus(); });
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

  byId(_index: number, entry: { id: string }) {
    return entry.id;
  }

  login() {
    void this.router.navigate(['/'], { queryParams: { next: this.router.url } });
  }
}
