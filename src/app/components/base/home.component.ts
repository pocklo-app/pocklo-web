import { Component, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { UserService } from '../../services/user.service';

@Component({
  templateUrl: './home.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less'],
})
export class HomeComponent implements OnInit {
  constructor(public userService: UserService, private meta: Meta) {}

  ngOnInit() {
    this.meta.updateTag({ name: 'description', content: '小兜是用来整理、预览和分享日常文件的网盘。' });
  }
}
