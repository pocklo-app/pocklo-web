import {Component, OnInit} from "@angular/core";
import {UserService} from "../../services/user.service";
import {Router} from "@angular/router";

@Component({
  template: '',
})
export class RefreshComponent implements OnInit {
  constructor(
    public userService: UserService,
    public router: Router,
  ) {}

  ngOnInit() {
    this.userService.api_get_info()
      .then(() => {
        this.router.navigate(['/res', this.userService.user.rootRes])
      })
      .catch(() => {
        void this.router.navigate(['/'], { replaceUrl: true });
      });
  }
}
