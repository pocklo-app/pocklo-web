import { Component, OnInit } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Info } from '../../models/base/info';
import { BaseService } from '../../services/base.service';

@Component({
  templateUrl: './cli.component.html',
  styleUrls: ['../../../assets/css/pocklo-pages.less'],
})
export class CliComponent implements OnInit {
  readonly commandSections = [
    { id: 'install', title: '安装', note: '需要 Python 3.9 或更新版本。', commands: [
      'python3 -m pip install pocklo',
    ] },
    { id: 'auth', title: '登录', note: '通过齐天簿完成授权。登录后可以查看当前账户。', commands: [
      'pocklo login', 'pocklo whoami',
    ] },
    { id: 'browse', title: '浏览目录', note: '支持路径和 @资源ID。', commands: [
      'pocklo ls', 'pocklo ls /Photos/2024', 'pocklo ls @Ab12Cd',
    ] },
    { id: 'transfer', title: '上传与下载', note: '传输单个文件或整个目录。', commands: [
      'pocklo upload ./report.pdf /Docs', 'pocklo upload ./albums /Photos',
      'pocklo download @Ab12Cd ./downloads/report.pdf',
    ] },
    { id: 'manage', title: '管理文件', note: '可以创建目录、移动、删除或保存网页链接。', commands: [
      'pocklo mkdir Archive @Ab12Cd', 'pocklo mv /Photos/new-name.jpg /Archive',
      'pocklo rm --recursive /Archive', 'pocklo link Example https://example.com',
    ] },
  ];

  constructor(private meta: Meta) {}

  ngOnInit() {
    this.meta.updateTag({ name: 'description', content: '在终端登录小兜、整理目录、上传和下载文件。' });
  }

  copyStatus(success: boolean) {
    BaseService.info_center.next(new Info({
      text: success ? '命令已复制' : '复制失败，请手动选择命令。',
      type: success ? Info.TYPE_SUCC : Info.TYPE_WARN,
    }));
  }
}
