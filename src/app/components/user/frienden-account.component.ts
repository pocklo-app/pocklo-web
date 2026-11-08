import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { BaseService } from '../../services/base.service';
import { UserService } from '../../services/user.service';

const BINDING_API = '/api/oauth/frienden/binding';
const STATE_KEY = 'pocklo.frienden.binding.state';

interface FriendenStatus {
  linked: boolean;
  phone: string | null;
}

@Component({
  templateUrl: './frienden-account.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less', './frienden-account.component.less'],
})
export class FriendenAccountComponent implements OnInit {
  status: FriendenStatus | null = null;
  pending = false;
  error = '';
  message = '';
  confirmUnlink = false;

  constructor(
    private api: BaseService,
    private route: ActivatedRoute,
    private location: Location,
    public user: UserService,
  ) {}

  get loggedIn() {
    return !!BaseService.token;
  }

  get loginUrl() {
    return this.user.oauth_uri + '&state=' + encodeURIComponent('/account');
  }

  async ngOnInit() {
    const callback = this.route.snapshot.data['friendenCallback'];
    const params = this.route.snapshot.queryParamMap;
    if (callback) this.location.replaceState('/account');
    if (!this.loggedIn) return;

    this.pending = true;
    try {
      if (callback) {
        try {
          await this.complete(params.get('state'), params.get('code'));
        } catch (error) {
          this.error = this.errorMessage(error);
        }
      }
      this.status = await this.api.get(BINDING_API);
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.pending = false;
    }
  }

  async link() {
    this.pending = true;
    this.error = '';
    this.message = '';
    try {
      const { url, state } = await this.api.post(BINDING_API, {});
      sessionStorage.setItem(STATE_KEY, state);
      window.location.assign(url);
    } catch (error) {
      this.error = this.errorMessage(error);
      this.pending = false;
    }
  }

  async unlink() {
    this.pending = true;
    this.error = '';
    this.message = '';
    try {
      this.status = await this.api.del(BINDING_API);
      this.confirmUnlink = false;
      this.message = '已解绑友间，并删除了保存的手机号。';
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.pending = false;
    }
  }

  private async complete(state: string | null, code: string | null) {
    if (!state || sessionStorage.getItem(STATE_KEY) !== state) {
      throw '授权回调无效，请在发起绑定的标签页完成授权。';
    }
    sessionStorage.removeItem(STATE_KEY);
    await this.api.post('/api/oauth/frienden/complete', { state, code: code || '' });
    this.message = '已保存友间绑定和已验证的手机号。';
  }

  private errorMessage(error: any) {
    return error?.error?.msg || (typeof error === 'string' ? error : '暂时无法完成操作，请稍后重试。');
  }
}
