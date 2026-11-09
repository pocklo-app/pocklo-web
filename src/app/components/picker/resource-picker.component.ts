import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { BaseService } from '../../services/base.service';
import { UserService } from '../../services/user.service';
import type { Entry, Workspace } from '../workspace/workspace.component';

const PREFIX = 'pocklo.picker.';

interface HostListing {
  resource: Entry;
  entries: Entry[];
  has_more: boolean;
  next_offset: number | null;
}

function hostOrigin(value: unknown) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (value === url.origin && (url.protocol === 'https:' || (local && url.protocol === 'http:'))) return value;
  } catch {}
  return '';
}

@Component({
  templateUrl: './resource-picker.component.html',
  styleUrls: ['./resource-picker.component.less'],
})
export class ResourcePickerComponent implements OnInit, OnDestroy {
  readonly loginPath = window.location.pathname + window.location.search;
  readonly embedded = this.route.snapshot.data['pickerEmbedded'] === true;
  readonly delegated = this.embedded && this.route.snapshot.queryParamMap.get('mode') === 'oauth';
  readonly action = this.embedded ? null : this.route.snapshot.queryParamMap.get('action');
  private readonly request = this.route.snapshot.queryParamMap.get('request') || '';
  private readonly expectedHost = hostOrigin(this.route.snapshot.queryParamMap.get('origin'));
  private readonly opener = window.opener;
  private handshakeTimer: ReturnType<typeof setTimeout>;
  private searchTimer: ReturnType<typeof setTimeout>;
  private popupTimer: ReturnType<typeof setInterval>;
  private userSubscription: Subscription;
  private popup?: { window: Window; nonce: string; action: 'session' | 'confirm'; resource?: string };
  private ticket = '';
  private resource = '';
  private version = 0;
  private directory = '';
  private readonly hostRequests = new Map<string, (message?: { result?: unknown; error?: string }) => void>();
  private shareAttempt?: { resource: string; operation: string };
  private hostCanShare = false;
  nextOffset: number | null = null;

  hostOrigin = '';
  sessionReady = false;
  disconnected = false;
  listing?: Workspace;
  selected?: Entry;
  query = '';
  view: 'list' | 'grid' = 'list';
  readonly views = [{ id: 'list', name: '列表' }, { id: 'grid', name: '图标' }] as const;
  loading = false;
  sharing = false;
  error = '';
  result = '';

  constructor(private route: ActivatedRoute, private api: BaseService, private http: HttpClient, private user: UserService) {}

  ngOnInit() {
    if (this.embedded) {
      if (window.parent === window || !this.expectedHost) {
        this.disconnected = true;
        return;
      }
      this.waitForConnection();
      this.send(window.parent, this.expectedHost, 'ready');
      return;
    }
    if (window.top !== window.self || !this.opener || !/^[\da-f-]{36}$/i.test(this.request)) {
      this.disconnected = true;
      return;
    }
    this.waitForConnection();
    this.notifyOpener('connect');
  }

  private waitForConnection() {
    this.handshakeTimer = setTimeout(() => this.disconnected = !this.hostOrigin, 3000);
  }

  ngOnDestroy() {
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.searchTimer);
    this.finishPopup();
    this.userSubscription?.unsubscribe();
    for (const finish of this.hostRequests.values()) finish();
    this.version++;
  }

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent) {
    const message = event.data;
    if (message?.version !== 1) return;
    if (this.embedded) {
      if (!this.hostOrigin && this.expectedHost && window.parent !== window &&
          event.source === window.parent && event.origin === this.expectedHost && message.type === PREFIX + 'init') {
        this.connect(this.expectedHost);
        this.sessionReady = true;
        if (this.delegated) {
          this.hostCanShare = message.canShare === true;
          this.openDirectory('');
        }
      } else if (this.delegated && this.hostOrigin && event.source === window.parent && event.origin === this.hostOrigin &&
                 message.type === PREFIX + 'response' && typeof message.requestId === 'string') {
        this.hostRequests.get(message.requestId)?.(message);
      } else if (this.popup && event.source === this.popup.window && event.origin === location.origin && message.nonce === this.popup.nonce) {
        this.onPopupMessage(message);
      }
      return;
    }
    if (this.hostOrigin || window.top !== window.self || !this.opener ||
        event.source !== this.opener || event.origin !== location.origin ||
        message.type !== PREFIX + 'connected' || message.nonce !== this.request) return;
    const origin = hostOrigin(message.hostOrigin);
    if (!origin) return;
    if (this.action === 'confirm') {
      if (typeof message.ticket !== 'string' || !message.ticket || typeof message.resource !== 'string' || !message.resource) return;
      this.ticket = message.ticket;
      this.resource = message.resource;
    }
    this.connect(origin);
    this.userSubscription = this.user.user_update_center.subscribe(() => this.loadAccount());
    if (this.user.has_get_user) this.loadAccount();
  }

  private connect(origin: string) {
    this.hostOrigin = origin;
    this.disconnected = false;
    clearTimeout(this.handshakeTimer);
  }

  private loadAccount() {
    this.sessionReady = true;
    if (!this.user.user?.rootRes || this.directory || this.action === 'session') return;
    this.openDirectory(this.action === 'confirm' ? this.resource : this.user.user.rootRes);
  }

  get signedIn() {
    return this.delegated ? this.sessionReady : this.embedded ? !!this.ticket : !!this.user.user;
  }

  private requestHost<T>(action: 'files' | 'share', fields: object): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (message?: { result?: unknown; error?: string }) => {
        clearTimeout(timer);
        this.hostRequests.delete(requestId);
        if (message && !message.error) resolve(message.result as T);
        else reject(new Error(message?.error || 'host_timeout'));
      };
      const timer = setTimeout(finish, 15000);
      this.hostRequests.set(requestId, finish);
      this.notifyHost('request', { requestId, action, ...fields });
    });
  }

  openPopup(action: 'session' | 'confirm') {
    if (this.popup || !this.embedded || this.delegated || !this.hostOrigin) return;
    this.error = '';
    this.result = '';
    const nonce = crypto.randomUUID();
    const url = new URL('/picker/select/', location.origin);
    url.searchParams.set('request', nonce);
    url.searchParams.set('action', action);
    const popup = window.open(url.href, 'pocklo-picker-' + nonce, 'popup,width=580,height=700');
    if (!popup) {
      this.error = '请允许当前网页打开小兜窗口，再重试。';
      this.notifyHost('error', { code: 'popup_blocked' });
      return;
    }
    this.popup = { window: popup, nonce, action, resource: this.selected?.id };
    this.sharing = true;
    let seenClosed = false;
    this.popupTimer = setInterval(() => {
      if (!this.popup?.window.closed) return;
      if (seenClosed) {
        this.finishPopup();
        this.error = '小兜窗口已关闭，可以重试。';
      }
      seenClosed = true;
    }, 500);
  }

  private onPopupMessage(message: any) {
    const popup = this.popup;
    if (message.type === PREFIX + 'connect') {
      this.send(popup.window, location.origin, 'connected', {
        nonce: popup.nonce, hostOrigin: this.hostOrigin,
        ...(popup.action === 'confirm' ? { ticket: this.ticket, resource: popup.resource } : {}),
      });
    } else if (message.type === PREFIX + 'session' && popup.action === 'session' && typeof message.ticket === 'string' && message.ticket) {
      this.ticket = message.ticket;
      this.finishPopup();
      this.openDirectory('');
    } else if (message.type === PREFIX + 'selected' && popup.action === 'confirm') {
      let url: URL;
      try { url = new URL(message.url); } catch { return; }
      if (url.origin !== location.origin || !/^\/share\/[a-f\d-]{36}$/i.test(url.pathname) || url.search || url.hash) return;
      this.result = url.href;
      this.notifyHost('selected', { url: this.result });
      this.finishPopup();
    } else if (message.type === PREFIX + 'expired' && popup.action === 'confirm') {
      this.finishPopup();
      this.ticket = '';
      this.listing = undefined;
      this.selected = undefined;
      this.error = '资源选择会话已失效，请重新连接小兜。';
    } else if (message.type === PREFIX + 'cancelled') {
      this.finishPopup();
      this.notifyHost('cancelled');
    }
  }

  private finishPopup() {
    clearInterval(this.popupTimer);
    this.popup?.window.close();
    this.popup = undefined;
    this.sharing = false;
  }

  async authorizeBrowsing() {
    if (this.embedded || this.action !== 'session' || !this.hostOrigin || !this.signedIn || this.sharing) return;
    this.sharing = true;
    this.error = '';
    try {
      const { ticket } = await this.api.post('/api/picker/session', {});
      this.notifyOpener('session', { ticket });
      window.close();
    } catch {
      this.error = '无法连接小兜，请重试。';
    } finally {
      this.sharing = false;
    }
  }

  openDirectory(id: string) {
    clearTimeout(this.searchTimer);
    this.directory = id;
    this.query = '';
    this.selected = undefined;
    this.nextOffset = null;
    void this.load();
  }

  search(value: string) {
    this.query = value;
    this.nextOffset = null;
    this.loading = true;
    this.selected = undefined;
    this.version++;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 220);
  }

  loadMore() {
    if (this.delegated && this.nextOffset !== null && !this.loading && !this.sharing) void this.load(this.nextOffset);
  }

  private async hostListing(query: string, offset: number): Promise<Workspace & { next_offset?: number }> {
    const result = await this.requestHost<HostListing>('files', { resourceId: this.directory, query, offset });
    if (!result?.resource?.folder || typeof result.resource.id !== 'string' || !Array.isArray(result.entries)) {
      throw new Error('invalid_response');
    }
    const breadcrumbs = this.listing?.breadcrumbs ?? [];
    const index = breadcrumbs.findIndex(part => part.id === result.resource.id);
    const path = index >= 0 ? breadcrumbs.slice(0, index + 1) : [...breadcrumbs, result.resource];
    return {
      resource: result.resource,
      entries: offset ? [...(this.listing?.entries ?? []), ...result.entries] : result.entries,
      breadcrumbs: path,
      has_more: result.has_more === true,
      can_manage: this.hostCanShare,
      can_delete: false,
      next_offset: result.next_offset,
    };
  }

  async load(offset = 0) {
    const version = ++this.version;
    this.loading = true;
    this.error = '';
    const query = this.query.trim();
    try {
      const listing: Workspace & { next_offset?: number } = this.delegated
        ? await this.hostListing(query, offset)
        : this.embedded
        ? (await firstValueFrom(this.http.get<{ body: Workspace }>(this.api.fillUrl('/api/picker/files'), {
            headers: { Authorization: 'Bearer ' + this.ticket }, params: { resource: this.directory, q: query },
          }))).body
        : await this.api.get('/api/res/' + encodeURIComponent(this.directory) + '/workspace', { q: query });
      if (version !== this.version) return;
      this.listing = listing;
      this.nextOffset = this.delegated && !query && Number.isSafeInteger(listing.next_offset) && listing.next_offset > offset
        ? listing.next_offset : null;
      if (this.action === 'confirm') this.selected = listing.resource;
    } catch (error) {
      if (version !== this.version) return;
      if (!offset) this.listing = undefined;
      if (this.embedded && error?.status === 401) {
        this.ticket = '';
        this.error = '资源选择会话已失效，请重新连接小兜。';
      } else this.error = this.delegated && ['invalid_token', 'connect_required', 'insufficient_scope', 'account_mismatch'].includes(error?.message)
        ? '小兜授权不可用，请在当前网页检查小兜连接。'
        : '无法读取资源，请重试。';
    } finally {
      if (version === this.version) this.loading = false;
    }
  }

  async share() {
    if (!this.hostOrigin || !this.selected || !this.listing?.can_manage || this.loading || this.sharing) return;
    if (this.embedded && !this.delegated) {
      this.openPopup('confirm');
      return;
    }
    this.sharing = true;
    this.error = '';
    try {
      if (this.delegated) {
        const resource = this.selected.id;
        if (this.shareAttempt?.resource !== resource) this.shareAttempt = { resource, operation: crypto.randomUUID() };
        const { url } = await this.requestHost<{ url: string }>('share', { resourceId: resource, operationId: this.shareAttempt.operation });
        const link = new URL(url);
        if (link.origin !== location.origin || !/^\/share\/[a-f\d-]{36}$/i.test(link.pathname) || link.search || link.hash) throw new Error();
        this.result = link.href;
        this.notifyHost('selected', { url: this.result });
        this.shareAttempt = undefined;
        return;
      }
      const { token } = this.action === 'confirm'
        ? await this.api.post('/api/picker/share', { resource_id: this.selected.id, ticket: this.ticket })
        : await this.api.post('/api/shares/', { res_str_id: this.selected.id });
      this.result = new URL('/share/' + encodeURIComponent(token), location.origin).href;
      this.notifyOpener('selected', { url: this.result });
      window.close();
    } catch (error) {
      if (this.delegated && ['insufficient_scope', 'connect_required', 'invalid_token'].includes(error?.message)) {
        this.error = '当前网页的小兜授权无法创建分享链接。';
        return;
      }
      this.error = error?.status === 401 ? '资源选择会话已失效，请返回原网页重新连接。' : '无法创建分享链接，请重试。';
      if (error?.status === 401) this.notifyOpener('expired');
    } finally {
      this.sharing = false;
    }
  }

  cancel() {
    if (this.sharing) return;
    if (this.embedded) {
      this.selected = undefined;
      this.result = '';
      if (this.hostOrigin) this.notifyHost('cancelled');
      return;
    }
    if (this.hostOrigin && !this.result) this.notifyOpener('cancelled');
    window.close();
  }

  private send(target: Window, origin: string, action: string, fields = {}) {
    target.postMessage({ type: PREFIX + action, version: 1, ...fields }, origin);
  }

  private notifyOpener(action: string, fields = {}) {
    this.send(this.opener, location.origin, action, { nonce: this.request, ...fields });
  }

  private notifyHost(action: string, fields = {}) {
    this.send(window.parent, this.hostOrigin, action, fields);
  }

  trackItem(_index: number, item: Entry) { return item.id; }
}
