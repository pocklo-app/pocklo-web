import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { BaseService } from '../../services/base.service';
import { UserService } from '../../services/user.service';

export const FRIENDEN_LOGIN_KEY = 'pocklo.frienden.login';

export function loginDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) {
    return '/res';
  }
  const destination = new URL(value, window.location.origin);
  if (destination.origin !== window.location.origin ||
      !/^\/(?:res(?:\/[^/]+){0,2}|account)$/.test(destination.pathname)) {
    return '/res';
  }
  return destination.pathname + destination.search + destination.hash;
}

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less'],
})
export class LoginComponent {
  error = '';
  pending = false;
  readonly next: string;

  constructor(private api: BaseService, private user: UserService, route: ActivatedRoute, router: Router) {
    this.next = loginDestination(route.snapshot.queryParamMap.get('next'));
    this.error = router.getCurrentNavigation()?.extras.state?.['friendenError'] || '';
  }

  get qitianUrl() {
    return this.user.oauth_uri + '&state=' + encodeURIComponent(this.next);
  }

  async friendenLogin() {
    this.error = '';
    this.pending = true;
    try {
      const { url, state, browser_key } = await this.api.post('/api/oauth/frienden/login', {});
      sessionStorage.setItem(FRIENDEN_LOGIN_KEY, JSON.stringify({ state, browser_key, next: this.next }));
      window.location.assign(url);
    } catch (error) {
      this.error = error?.error?.msg || '暂时无法发起友间登录，请稍后重试。';
      this.pending = false;
    }
  }
}
