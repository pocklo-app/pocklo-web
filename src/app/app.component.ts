import {Component, OnInit} from '@angular/core';
import {UserService} from "./services/user.service";
import {BaseService} from "./services/base.service";
import { environment } from '../environments/environment';
import {Router} from "@angular/router";

@Component({
  selector: 'app-root',
  template: `
    <aside *ngIf="legacyDestination" class="pocklo-move" aria-label="域名迁移提醒">
      <span><strong>小兜已搬家。</strong> 旧域名过渡至 {{migrationUntil}}，请更新书签。</span>
      <a [href]="legacyDestination">前往 pocklo.jyonn.space →</a>
    </aside>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent implements OnInit {
  readonly migrationUntil = document.querySelector<HTMLMetaElement>('meta[name="pocklo-move-until"]')?.content;
  private readonly isLegacyOrigin = window.location.origin === environment.legacyOrigin;

  get legacyDestination() {
    if (!this.isLegacyOrigin || !this.migrationUntil || window.location.pathname.startsWith('/oauth/')) return '';
    return environment.pockloOrigin + window.location.pathname + window.location.search + window.location.hash;
  }

  constructor(
    public userService: UserService,
    public baseService: BaseService,
    private router: Router,
  ) {}
  ngOnInit() {
    if (this.legacyDestination && Date.now() >= Date.parse(this.migrationUntil + 'T00:00:00+08:00')) {
      window.location.replace(this.legacyDestination);
      return;
    }
    // BaseService.token_center.asObservable()
    //   .subscribe(() => {
    this.userService.api_get_info()
      .then()
      .catch((resp) => {
        if (resp === BaseService.relogin_warn) {
          setTimeout(() => {
            void this.router.navigate(['/login'], { queryParams: { next: this.router.url } });
          }, 3000);
        }
      });
  }
}
