import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { BaseService } from '../../services/base.service';
import { UserService } from '../../services/user.service';
import type { Entry, Workspace } from '../workspace/workspace.component';

@Component({
  templateUrl: './resource-picker.component.html',
  styleUrls: ['./resource-picker.component.less'],
})
export class ResourcePickerComponent implements OnInit, OnDestroy {
  readonly loginPath = window.location.pathname + window.location.search;
  private readonly request = this.route.snapshot.queryParamMap.get('request') || '';
  private readonly opener = window.opener;
  private handshakeTimer: ReturnType<typeof setTimeout>;
  private searchTimer: ReturnType<typeof setTimeout>;
  private userSubscription: Subscription;
  private version = 0;
  private directory = '';

  hostOrigin = '';
  sessionReady = false;
  disconnected = false;
  listing?: Workspace;
  selected?: Entry;
  query = '';
  loading = false;
  sharing = false;
  error = '';
  result = '';

  constructor(private route: ActivatedRoute, private api: BaseService, private user: UserService) {}

  ngOnInit() {
    if (window.top !== window.self || !this.opener || !/^[\da-f-]{36}$/i.test(this.request)) {
      this.disconnected = true;
      return;
    }
    this.handshakeTimer = setTimeout(() => this.disconnected = !this.hostOrigin, 3000);
    this.notify('connect');
  }

  ngOnDestroy() {
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.searchTimer);
    this.userSubscription?.unsubscribe();
    this.version++;
  }

  @HostListener('window:message', ['$event'])
  onConnect(event: MessageEvent) {
    if (this.hostOrigin || window.top !== window.self || !this.opener ||
        event.source !== this.opener || event.origin !== location.origin ||
        event.data?.type !== 'pocklo.picker.connected' || event.data.version !== 1 ||
        event.data.nonce !== this.request || typeof event.data.hostOrigin !== 'string') return;
    this.hostOrigin = event.data.hostOrigin;
    this.disconnected = false;
    clearTimeout(this.handshakeTimer);
    this.userSubscription = this.user.user_update_center.subscribe(() => this.loadRoot());
    if (this.user.has_get_user) this.loadRoot();
  }

  private loadRoot() {
    this.sessionReady = true;
    if (this.user.user?.rootRes && !this.directory) this.openDirectory(this.user.user.rootRes);
  }

  get signedIn() { return !!this.user.user; }

  openDirectory(id: string) {
    clearTimeout(this.searchTimer);
    this.directory = id;
    this.query = '';
    this.selected = undefined;
    void this.load();
  }

  search(value: string) {
    this.query = value;
    this.loading = true;
    this.selected = undefined;
    this.version++;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 220);
  }

  async load() {
    const version = ++this.version;
    this.loading = true;
    this.error = '';
    try {
      const listing: Workspace = await this.api.get('/api/res/' + encodeURIComponent(this.directory) + '/workspace', { q: this.query.trim() });
      if (version === this.version) this.listing = listing;
    } catch {
      if (version === this.version) {
        this.listing = undefined;
        this.error = '无法读取这个文件夹，请重试。';
      }
    } finally {
      if (version === this.version) this.loading = false;
    }
  }

  async share() {
    if (!this.hostOrigin || !this.selected || !this.listing?.can_manage || this.loading || this.sharing || this.result) return;
    this.sharing = true;
    this.error = '';
    try {
      const { token } = await this.api.post('/api/shares/', { res_str_id: this.selected.id });
      this.result = new URL('/share/' + encodeURIComponent(token), location.origin).href;
      this.notify('selected', { url: this.result });
      window.close();
    } catch {
      this.error = '无法创建分享链接，请重试。';
    } finally {
      this.sharing = false;
    }
  }

  cancel() {
    if (this.sharing) return;
    if (this.hostOrigin && !this.result) this.notify('cancelled');
    window.close();
  }

  private notify(action: string, fields = {}) {
    this.opener?.postMessage({ type: 'pocklo.picker.' + action, version: 1, nonce: this.request, ...fields }, location.origin);
  }

  trackItem(_index: number, item: Entry) { return item.id; }
}
