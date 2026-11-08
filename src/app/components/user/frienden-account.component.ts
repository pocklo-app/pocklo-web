import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { BaseService } from '../../services/base.service';
import { UserService } from '../../services/user.service';

import { FRIENDEN_LOGIN_KEY, loginDestination } from '../../services/login-navigation';

const BINDING_API = '/api/oauth/frienden/binding';
const STATE_KEY = 'pocklo.frienden.binding.state';

interface FriendenStatus {
  linked: boolean;
  phone: string | null;
  can_unlink: boolean;
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
    private router: Router,
    public user: UserService,
  ) {}

  get loggedIn() {
    return !!BaseService.token;
  }

  logout() {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(FRIENDEN_LOGIN_KEY);
    this.user.exit();
    window.location.replace('/');
  }

  async ngOnInit() {
    const callback = this.route.snapshot.data['friendenCallback'];
    const params = this.route.snapshot.queryParamMap;
    if (callback && (!params.get('state') || params.get('state') !== sessionStorage.getItem(STATE_KEY))) {
      this.location.replaceState('/');
      await this.finishLogin(params.get('state'), params.get('code'));
      return;
    }
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

  private async finishLogin(state: string | null, code: string | null) {
    this.pending = true;
    let next = '/res';
    try {
      const pending = JSON.parse(sessionStorage.getItem(FRIENDEN_LOGIN_KEY) || 'null');
      if (!state || pending?.state !== state) {
        throw '授权回调无效，请在发起登录的标签页完成授权。';
      }
      sessionStorage.removeItem(FRIENDEN_LOGIN_KEY);
      next = loginDestination(pending.next);
      const session = await this.api.post('/api/oauth/frienden/login/complete', {
        state, code: code || '', browser_key: pending.browser_key,
      });
      this.user.acceptLogin(session);
      await this.router.navigateByUrl(next, { replaceUrl: true });
    } catch (error) {
      await this.router.navigate(['/'], {
        queryParams: { next }, replaceUrl: true, state: { loginError: this.errorMessage(error) },
      });
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
