import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseService } from '../../services/base.service';
import { FRIENDEN_LOGIN_KEY, loginDestination } from '../../services/login-navigation';
import { UserService } from '../../services/user.service';

@Component({
  templateUrl: './home.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less'],
})
export class HomeComponent implements OnInit, AfterViewInit {
  @ViewChild('friendenButton') private friendenButton?: ElementRef<HTMLButtonElement>;

  pending = false;
  error: string;

  constructor(
    public userService: UserService,
    private meta: Meta,
    private api: BaseService,
    private route: ActivatedRoute,
    router: Router,
  ) {
    this.error = router.getCurrentNavigation()?.extras.state?.['loginError'] || '';
  }

  private get next() {
    return loginDestination(this.route.snapshot.queryParamMap.get('next'));
  }

  get qitianUrl() {
    return this.userService.oauth_uri + '&state=' + encodeURIComponent(this.next);
  }

  ngOnInit() {
    this.meta.updateTag({ name: 'description', content: '小兜是用来整理、预览和分享日常文件的网盘。' });
  }

  ngAfterViewInit() {
    if (this.error || this.route.snapshot.queryParamMap.has('next')) this.focusLogin();
  }

  focusLogin() {
    this.friendenButton?.nativeElement.focus();
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
