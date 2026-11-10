import {Component, DestroyRef, OnInit} from "@angular/core";
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {UserService} from "../../services/user.service";
import {User} from "../../models/user/user";
import {ActivatedRoute, Router} from "@angular/router";

@Component({
  template: '',
})
export class ResHomeComponent implements OnInit {
  next_url: string;

  constructor(
    private userService: UserService,
    private destroyRef: DestroyRef,
    private router: Router,
    public activateRoute: ActivatedRoute,
  ) {}

  jump_user_home(user) {
    if (user) {
      if (this.next_url) {
        void this.router.navigate([decodeURIComponent(this.next_url)], { replaceUrl: true });
      } else {
        void this.router.navigate(['/res'], { replaceUrl: true });
      }
    }
  }

  ngOnInit() {
    this.activateRoute.params.subscribe((params) => {
      this.next_url = params['next'];
    });
    if (this.userService.user) {
      this.jump_user_home(this.userService.user);
    } else if (this.userService.has_get_user) {
      void this.router.navigate(['/'], { queryParams: { next: this.router.url }, replaceUrl: true });
      return;
    }
    this.userService.user_update_center.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user: User) => {
        if (user) {
          this.jump_user_home(user);
        } else {
          void this.router.navigate(['/'], { queryParams: { next: this.router.url }, replaceUrl: true });
        }
      });
  }
}
