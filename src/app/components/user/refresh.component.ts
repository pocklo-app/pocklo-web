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
        void this.router.navigate(['/res'], { replaceUrl: true });
      })
      .catch(() => {
        void this.router.navigate(['/'], { replaceUrl: true });
      });
  }
}
