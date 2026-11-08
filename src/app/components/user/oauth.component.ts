import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { UserService } from '../../services/user.service';
import { loginDestination } from './login.component';

@Component({ template: '' })
export class OauthComponent implements OnInit {
  constructor(private route: ActivatedRoute, private user: UserService, private router: Router) {}

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const next = loginDestination(params.get('state'));
    try {
      const session = await this.user.api_qtb_oauth_check({ code: params.get('code') });
      this.user.acceptLogin(session);
      await this.router.navigateByUrl(next, { replaceUrl: true });
    } catch {
      await this.router.navigate(['/login'], { queryParams: { next }, replaceUrl: true });
    }
  }
}
