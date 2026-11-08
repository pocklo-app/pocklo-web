import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BaseService } from '../../services/base.service';

interface Application {
  client_id: string;
  name: string;
  website: string;
  purpose: string;
  redirect_uris: string[];
  review: string;
  review_reason: string;
  enabled: boolean;
  revision: number;
  developer_id?: number;
}
interface Grant {
  id: string;
  name: string;
  scope: string;
  active: boolean;
}
interface Consent {
  application: Pick<Application, 'name' | 'website' | 'purpose'>;
  redirect_uri: string;
  scope: string;
  permission_version: number;
  account: string;
}

const errors: Record<string, string> = {
  admin_required: '当前账号没有 OAuth 管理权限。',
  application_changed: '应用配置已更新，请刷新页面后重试。',
  application_disabled: '该应用已被停用。',
  application_approval_required: '该应用尚未获准创建分享。',
  authorization_request_expired: '授权请求已失效，请回到应用重新发起。',
  invalid_consent: '授权信息已变化，请回到应用重新发起。',
  invalid_request: '请检查必填字段和长度限制。',
  invalid_redirect_uris: '请登记 1 至 10 个回调地址。',
  invalid_url: '请输入有效的 HTTPS 地址，回调不得包含片段或 code、state、error 参数。',
  invalid_action: '该操作当前不可用，请刷新后重试。',
};

@Component({
  templateUrl: './developer.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less', './developer.component.less'],
})
export class DeveloperComponent implements OnInit {
  mode = this.route.snapshot.data['mode'] as string;
  requestId = this.route.snapshot.paramMap.get('id');
  next = this.router.url;
  busy = false;
  needsLogin = false;
  error = '';
  message = '';
  docs = '';
  applications: Application[] = [];
  grants: Grant[] = [];
  consent: Consent;
  canReview = false;
  registering = false;
  secret: { clientId: string; value: string };
  editing: Application;
  redirectInput = '';
  reviewReason = '';
  form = { name: '', website: '', purpose: '', redirects: '', requestSharing: false };

  readonly titles = { applications: '开发者平台', admin: '应用审批', grants: '已授权应用', consent: '连接小兜', docs: '接入文档' };
  readonly reviewLabels = { none: '未申请', pending: '待审批', approved: '已批准', rejected: '未通过', revoked: '已撤销' };

  constructor(private api: BaseService, private http: HttpClient, private route: ActivatedRoute, private router: Router) {}

  get callbackHost() {
    return this.consent ? new URL(this.consent.redirect_uri).host : '';
  }

  async ngOnInit() {
    await this.run(async () => {
      if (this.mode === 'docs') {
        this.docs = await firstValueFrom(this.http.get('assets/pocklo-oauth.md', { responseType: 'text' }));
      } else if (this.mode === 'consent') {
        this.consent = await this.request('GET', 'requests/' + this.requestId + '/');
      } else if (this.mode === 'grants') {
        ({ grants: this.grants } = await this.request('GET', 'grants/'));
      } else {
        const result = await this.request('GET', this.mode === 'admin' ? 'admin/applications/' : 'applications/');
        this.applications = result.applications;
        this.canReview = result.can_review;
      }
    });
  }

  private request(method: string, path: string, body?: object): Promise<any> {
    return firstValueFrom(this.http.request(method, this.api.fillUrl('/api/oauth/' + path), {
      headers: { Token: BaseService.token || '' }, body,
    }));
  }

  private async run(task: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.message = this.error = '';
    try {
      await task();
    } catch (error) {
      const code = error?.error?.error;
      this.needsLogin = code === 'login_required';
      this.error = this.needsLogin ? '' : errors[code] || '请求未完成，请稍后重试。';
    } finally {
      this.busy = false;
    }
  }

  private lines(text: string) {
    return text.split('\n').map(line => line.trim()).filter(Boolean);
  }

  async register() {
    await this.run(async () => {
      const { name, website, purpose, redirects, requestSharing } = this.form;
      const result = await this.request('POST', 'applications/', {
        name, website, purpose, redirect_uris: this.lines(redirects), request_sharing: requestSharing,
      });
      this.applications = [result.application, ...this.applications];
      this.secret = { clientId: result.application.client_id, value: result.client_secret };
      this.form = { name: '', website: '', purpose: '', redirects: '', requestSharing: false };
      this.registering = false;
    });
  }

  edit(app: Application) {
    this.editing = app;
    this.redirectInput = app.redirect_uris.join('\n');
    this.reviewReason = '';
  }

  async update(app: Application, action: string) {
    if (['rotate_secret', 'disable', 'revoke_sharing'].includes(action)
        && !window.confirm('此操作会使该应用现有授权失效。确定继续？')) return;
    await this.run(async () => {
      const path = this.mode === 'admin' ? 'admin/applications/' : 'applications/';
      const result = await this.request('PUT', path + app.client_id + '/', {
        action, confirmed: true, revision: app.revision,
        redirect_uris: this.lines(this.redirectInput), reason: this.reviewReason,
      });
      this.applications = this.applications.map(item => item.client_id === app.client_id ? result.application : item);
      this.editing = null;
      if (result.client_secret) this.secret = { clientId: app.client_id, value: result.client_secret };
      this.message = '已保存。';
    });
  }

  hasScope(scope: string, permission: string) {
    return scope.split(' ').includes(permission);
  }

  async decide(approve: boolean) {
    await this.run(async () => {
      const result = await this.request('POST', 'requests/' + this.requestId + '/', {
        approve, permission_version: this.consent.permission_version,
      });
      this.consent = null;
      window.location.assign(result.redirect_uri);
    });
  }

  async revoke(grant: Grant) {
    if (!window.confirm('撤销后，应用将无法继续访问。已创建的分享链接可在「我的分享」中撤销。')) return;
    await this.run(async () => {
      await this.request('DELETE', 'grants/' + grant.id + '/');
      grant.active = false;
      this.message = '已撤销授权。';
    });
  }
}
