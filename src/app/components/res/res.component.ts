import { AfterViewInit, Component, ElementRef, HostListener, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { UserService } from "../../services/user.service";
import { Resource } from "../../models/res/resource";
import { ClockService } from "../../services/clock.service";
import { ResourceService } from "../../services/resource.service";
import { ActivatedRoute, Router } from "@angular/router";
import { FootBtnService } from "../../services/foot-btn.service";
import { FootBtn } from "../../models/res/foot-btn";
import { Subject } from "rxjs";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";

import { BaseService } from "../../services/base.service";
import { Info } from "../../models/base/info";
import { DomSanitizer, Meta, SafeResourceUrl } from "@angular/platform-browser";
import { OperationResItem } from "../../models/res/operation-res-item";
import { ResourceTreeService } from "../../services/resource-tree.service";
import {WechatShareService} from "../../services/wechat-share.service";
import {VideoService} from "../../services/video.service";

interface DragUploadItem {
  file: File;
  relativePath: string;
}

type FolderViewMode = 'list' | 'column' | 'gallery';

@Component({
  selector: 'app-res',
  templateUrl: './res.component.html',
  styleUrls: [
    '../../../assets/css/icon-fonts.css',
    '../../../assets/css/nav.less',
    '../../../assets/css/footer.less',
    '../../../assets/css/res.less',
  ],
})
export class ResComponent implements OnInit, AfterViewInit {
  static sort_accord = 'name';
  static sort_ascend = true;
  static relative_time = true;
  static readonly FOLDER_VIEW_STORAGE_KEY = 'folder-view-mode';
  static readonly VIEW_LIST: FolderViewMode = 'list';
  static readonly VIEW_COLUMN: FolderViewMode = 'column';
  static readonly VIEW_GALLERY: FolderViewMode = 'gallery';
  static readonly HTX_DISPLAY_MODE = 'list';
  static readonly HTX_DOWNLOAD_MODE = 'download';
  static readonly HTX_MORE_MODE = 'more';

  @ViewChild('resList') resListElement: ElementRef;
  @ViewChildren('resNameViewport') resNameViewportRefs: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('resNameText') resNameTextRefs: QueryList<ElementRef<HTMLSpanElement>>;

  res_str_id: string;

  resource: Resource;
  children: Resource[];
  search_list: Resource[];

  search_value: string;
  search_terms: Subject<string>;

  search_mode: boolean;
  tab_mode: string;

  sort_mode: boolean;  // 排序模式 分为name time type
  visit_key: string;  // 资源密钥

  description: string;  // 资源描述

  total_op_num: number;  // 所有待操作的资源数目
  current_op_num: number;  // 当前正在操作的数目
  current_path: string;  // 当前操作的路径
  current_item_percentage: number;  // 正在上传的文件的上传比例
  show_op_process: boolean; // 是否进入操作画面
  op_text: string;
  op_identifier: string;
  op_append_msg: string;
  operations: any;

  operation_list: OperationResItem[];  // 操作列表
  delete_text: string;  // 删除文字

  is_multi_mode: boolean;  // 是否在多选模式下的operation模式

  scroll_top: string;

  modify_desc: boolean;
  htx_command_mode: string;
  is_htx_menu_open: boolean;

  player: any;
  name_overflow_states: {[res_id: string]: {overflowing: boolean, shift: number}};
  pending_name_overflow_refresh: boolean;
  resource_mode_updating: boolean;
  show_drag_upload_overlay: boolean;
  drag_upload_depth: number;
  folder_view_mode: FolderViewMode;
  active_gallery_res_id: string;

  constructor(
    public baseService: BaseService,
    public userService: UserService,
    public resService: ResourceService,
    public clockService: ClockService,
    public footBtnService: FootBtnService,
    public resTreeService: ResourceTreeService,
    private activateRoute: ActivatedRoute,
    private wechatShare: WechatShareService,
    private video: VideoService,
    private router: Router,
    private meta: Meta,
    private sanitizer: DomSanitizer,
  ) {
    this.resource = null;
    this.res_str_id = '';
    this.visit_key = null;
    this.search_list = [];
    this.search_value = null;
    this.search_mode = false;
    this.sort_mode = false;
    this.current_op_num = 0;
    this.total_op_num = 0;
    this.show_op_process = false;
    this.tab_mode = 'resource';
    this.modify_desc = false;
    this.htx_command_mode = ResComponent.HTX_DISPLAY_MODE;
    this.is_htx_menu_open = false;
    this.name_overflow_states = {};
    this.pending_name_overflow_refresh = false;
    this.resource_mode_updating = false;
    this.show_drag_upload_overlay = false;
    this.drag_upload_depth = 0;
    this.folder_view_mode = this.load_folder_view_mode();
    this.active_gallery_res_id = '';

    this.operations = {
      delete: {
        text: '删除',
        func: this.recursiveDelete.bind(this),
      },
      move: {
        text: '移动',
        func: this.directMove.bind(this),
      },
      upload: {
        text: '上传',
        func: this.multipleUpload.bind(this),
      },
      'upload-folder': {
        text: '上传',
        func: this.uploadFolder.bind(this),
      }
    };

    if (video.jsLC.loaded) {
      this.initVideo();
    } else {
      video.jsLC.calling(this.initVideo.bind(this));
    }
  }

  initVideo() {
    // this.player = this.video.getPlayer('video-js');
  }

  private load_folder_view_mode(): FolderViewMode {
    const mode = window.localStorage.getItem(ResComponent.FOLDER_VIEW_STORAGE_KEY) as FolderViewMode;
    if (mode === ResComponent.VIEW_COLUMN || mode === ResComponent.VIEW_GALLERY) {
      return mode;
    }
    return ResComponent.VIEW_LIST;
  }

  baseInitResource(resp) {
    this.reset_drag_upload_state();
    this.children = [];
    this.resource = new Resource(this.baseService, resp.info);
    this.description = this.resource.description;
    if (!this.description && !this.is_mine) {
      this.description = '暂无介绍资料';
    }
    for (const item of resp.child_list) {
      item.parent_str_id = this.resource.res_str_id;
      const r_child = new Resource(null, item);
      this.children.push(r_child);
    }
    this.reset_htx_command_mode();
    this.resource_search();
    this.maybe_auto_enter_gallery();
    this.meta.updateTag({name: 'description', content: `${this.resource.owner.nickname}分享了“${this.resource.rname}”，快来看看吧！`});
    this.meta.updateTag({name: 'image', content: this.resource.cover_small});

    // this.wechatShare.title = `浑天匣 - ${this.resource.rname}`;
    // this.wechatShare.desc = `${this.resource.owner.nickname}分享了“${this.resource.rname}”，快来看看吧！`;
    // this.wechatShare.imgUrl = this.resource.cover_small;
    // if (this.wechatShare.jsLC.loaded) {
    //   this.wechatShare.sharePrepare();
    // } else {
    //   this.wechatShare.jsLC.reset().calling(this.wechatShare.sharePrepare.bind(this.wechatShare));
    // }
  }
  initResLose(base_resp) {
    this.reset_drag_upload_state();
    base_resp.info.rtype = Resource.RTYPE_ENCRYPT;
    this.resource = new Resource(this.baseService, base_resp.info);
    this.description = '无法查看介绍资料';
    this.children = [];
    this.search_list = this.children.concat();
    this.reset_htx_command_mode();
  }
  initResource() {
    const v_key = ResourceService.loadVK(this.res_str_id);
    const cookie = BaseService.loadPageCookie(this.res_str_id);
    this.search_value = cookie.kw;
    this.search_mode = !!cookie.kw;
    this.resService.get_base_res_info(this.res_str_id)
      .then((base_resp) => {
        if (base_resp.readable || v_key) {
          this.resService.get_res_info(this.res_str_id, {visit_key: v_key})
            .then((resp) => {
              this.baseInitResource(resp);
              this.scroll_top = cookie.scroll || '0';
            })
            .catch((e) => {
              ResourceService.clearVK(this.res_str_id);
              this.initResLose(base_resp);
            });
        } else {
          this.initResLose(base_resp);
        }
        this.baseService.is_jumping = false;
      })
      .catch(() => {
        BaseService.info_center.next(new Info({text: '资源加载失败', type: Info.TYPE_WARN}));
        this.baseService.is_jumping = false;
      });
      // .catch(msg => console.log(msg));
  }

  onscroll(scroll) {
    this.scroll_top = scroll;
  }

  ngOnInit(): void {
    this.activateRoute.params.subscribe((params) => {
      this.res_str_id = params['res_str_id'];

      this.initResource();
      this.clockService.startClock();
      if (params['tab'] === 'resource' || params['tab'] === 'description') {
        this.tab_mode = params['tab'];
      }
      // this.tab_mode = 'resource';
    });
    this.search_terms = new Subject<string>();
    this.search_terms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    )
      .subscribe(keyword => this.resource_search(keyword));
  }

  ngAfterViewInit(): void {
    this.resNameViewportRefs.changes.subscribe(() => this.schedule_name_overflow_refresh());
    this.resNameTextRefs.changes.subscribe(() => this.schedule_name_overflow_refresh());
    this.schedule_name_overflow_refresh();
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.is_htx_menu_open = false;
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.schedule_name_overflow_refresh();
  }

  set_folder_view_mode(mode: FolderViewMode, event?: Event) {
    event?.stopPropagation();
    if (this.folder_view_mode === mode) {
      return;
    }
    this.folder_view_mode = mode;
    window.localStorage.setItem(ResComponent.FOLDER_VIEW_STORAGE_KEY, mode);
    if (mode === ResComponent.VIEW_GALLERY) {
      this.ensure_gallery_focus();
    } else if (mode === ResComponent.VIEW_LIST) {
      this.schedule_name_overflow_refresh();
    }
  }

  @HostListener('document:dragenter', ['$event'])
  onDocumentDragEnter(event: DragEvent) {
    if (!this.can_drag_upload || !this.is_file_drag(event)) {
      return;
    }
    event.preventDefault();
    this.drag_upload_depth += 1;
    this.show_drag_upload_overlay = true;
  }

  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent) {
    if (!this.can_drag_upload || !this.is_file_drag(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.show_drag_upload_overlay = true;
  }

  @HostListener('document:dragleave', ['$event'])
  onDocumentDragLeave(event: DragEvent) {
    if (!this.show_drag_upload_overlay || !this.is_file_drag(event)) {
      return;
    }
    if (event.clientX <= 0 || event.clientY <= 0 ||
      event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
      this.reset_drag_upload_state();
      return;
    }
    this.drag_upload_depth = Math.max(this.drag_upload_depth - 1, 0);
    if (this.drag_upload_depth === 0) {
      this.show_drag_upload_overlay = false;
    }
  }

  @HostListener('document:drop', ['$event'])
  async onDocumentDrop(event: DragEvent) {
    if (!this.can_drag_upload || !this.is_file_drag(event)) {
      return;
    }
    event.preventDefault();
    this.reset_drag_upload_state();
    if (this.show_op_process) {
      BaseService.info_center.next(new Info({text: '当前已有任务正在执行，请稍后再拖拽上传', type: Info.TYPE_WARN}));
      return;
    }
    const items = await this.collect_drag_upload_items(event.dataTransfer);
    if (!items.length) {
      BaseService.info_center.next(new Info({text: '未识别到可上传的本地文件或目录', type: Info.TYPE_WARN}));
      return;
    }
    this.queue_drag_upload(items);
  }

  get op_percent() {
    if (!this.total_op_num) {
      return '0%';
    }
    return Math.floor((this.current_op_num + this.current_item_percentage / 100) / this.total_op_num * 95 + 5) + '%';
  }

  async multipleUpload(upload_res_list: Array<OperationResItem>) {
    for (const upload_res_item of upload_res_list) {
      this.current_item_percentage = 0;
      this.current_path = upload_res_item.readablePath;
      const resp = await this.resService.get_upload_token(this.res_str_id, {filename: upload_res_item.readablePath});
      const res_data = await this.baseService.api_upload_file(resp.key, resp.upload_token, this.upload_source_file(upload_res_item),
        (process) => {
        this.current_item_percentage = process.percentage;
        this.op_append_msg = '，当前文件' + process.percentage + '%';
      });
      this.addChildRes(new Resource(null, res_data));
      this.current_item_percentage = 0;
      this.current_op_num += 1;
    }
  }

  async directMove(move_res_list: Array<OperationResItem>) {
    this.current_item_percentage = 0;
    for (const move_res_item of move_res_list) {
      // console.log(move_res_item);
      this.current_path = move_res_item.readablePath;
      // await this.fake_wait();
      await this.resService.modify_res_info(move_res_item.resId,
        {
          rname: null,
          right_bubble: null,
          description: null,
          visit_key: null,
          status: null,
          parent_str_id: ResourceTreeService.selectResStrId
        });
      this.current_op_num += 1;
    }
  }

  randomString(len) {
    len = len || 32;
    const $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
    const maxPos = $chars.length;
    let pwd = '';
    for (let i = 0; i < len; i++) {
      pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
    }
    return pwd;
  }

  async uploadFolder(upload_res_list: Array<OperationResItem>) {
    const folder_tree = {children: {}, res_id: this.res_str_id};
    for (const upload_res_item of upload_res_list) {
      this.current_item_percentage = 0;
      const paths = this.upload_relative_path(upload_res_item).split('/');
      paths.pop();
      let current_directory = folder_tree;
      for (const directory of paths) {
        if (!(directory in current_directory.children)) {
          this.current_item_percentage = 0;
          this.total_op_num += 1;
          this.current_path = paths.join(' / ');
          const _resp = await this.resService.create_folder(current_directory.res_id, {folder_name: directory});
          // const _resp = await this.fake_wait();
          current_directory.children[directory] = {children: {}, res_id: _resp.res_str_id};
          if (current_directory.res_id === this.res_str_id) {
            this.addChildRes(new Resource(null, _resp));
          }
          this.current_op_num += 1;
        }
        current_directory = current_directory.children[directory];
      }

      this.current_path = upload_res_item.readablePath;
      // const resp = await this.fake_wait();
      const resp = await this.resService.get_upload_token(current_directory.res_id, {filename: this.upload_source_name(upload_res_item)});
      const res_data = await this.baseService.api_upload_file(resp.key, resp.upload_token, this.upload_source_file(upload_res_item),
        (process) => {
          this.current_item_percentage = process.percentage;
          this.op_append_msg = '，当前文件' + process.percentage + '%';
        });
      if (current_directory.res_id === this.res_str_id) {
        this.addChildRes(new Resource(null, res_data));
      }
      this.current_op_num += 1;
    }
  }

  async recursiveDelete(delete_res_list: Array<OperationResItem>) {
    this.current_item_percentage = 0;
    for (let index = 0; index < delete_res_list.length; index++) {
      const delete_res_item = delete_res_list[index];
      const resp = await this.resService.get_res_info(delete_res_item.resId, null);
      if (resp.info.sub_type === Resource.STYPE_FOLDER) {
        this.total_op_num += resp.child_list.length;
        for (let i = 0; i < resp.child_list.length; i++) {
          const child_res_id = resp.child_list[i].res_str_id;
          const child_readable_path = delete_res_item.readablePath + "   /   " + resp.child_list[i].rname;
          if (resp.child_list[i].sub_type === Resource.STYPE_FOLDER) {
            await this.recursiveDelete([new OperationResItem({
              res_str_id: child_res_id,
              readablePath: child_readable_path,
            })]);
          } else {
            this.current_op_num += 1;
            // console.log(child_res_id);
            this.current_path = child_readable_path;
            await this.resService.delete_res(child_res_id);
            // await this.fake_wait();
          }
        }
      }
      this.current_op_num += 1;
      this.current_path = delete_res_item.readablePath;
      await this.resService.delete_res(delete_res_item.resId);
      // await this.fake_wait();
      // console.log(deleteResItem.path);
    }
  }

  fake_wait() {
    return new Promise<void>((resolve, object) => {
      setTimeout(() => resolve(), 2000);
    });
  }

  resource_search(keyword: string = null) {
    if (!keyword) {
      keyword = "";
    }
    if (this.search_value) {
      keyword = this.search_value;
    }
    this.search_list = [];
    for (const item of this.children) {
      if (item.rname.indexOf(keyword) >= 0) {
        this.search_list.push(item);
      }
    }
    this.sort_by(true);
  }

  select_res(res: Resource, event?: Event) {
    event?.stopPropagation();
    res.selected = !res.selected;
  }

  clear_selection() {
    for (const item of this.search_list) {
      item.selected = false;
    }
  }

  toggle_select_all(event?: Event) {
    event?.stopPropagation();
    const next_state = !this.all_search_list_selected;
    for (const item of this.search_list) {
      item.selected = next_state;
    }
  }

  toggle_selection_mode() {
    if (!this.is_owner) {
      return;
    }
    if (this.footBtnService.is_selecting) {
      this.select_res_help('cancel');
      return;
    }
    this.activate_btn(this.footBtnService.foot_btn_select);
  }

  select_res_help(help: string) {
    if (help === 'all') {
      for (const item of this.search_list) {
        item.selected = true;
      }
    } else if (help === 'adverse') {
      for (const item of this.search_list) {
        item.selected = !item.selected;
      }
    } else if (help === 'cancel') {
      this.clear_selection();
      this.footBtnService.inactivate();
    } else if (help === 'delete' || help === 'move') {
      this.is_multi_mode = true;
      this.operation_list = [];
      for (const item of this.search_list) {
        if (item.selected) {
          this.operation_list.push(new OperationResItem({
            res_str_id: item.res_str_id,
            readablePath: this.resource.rname + '   /   ' + item.rname,
          }));
        }
      }
      if (this.operation_list.length === 0) {
        BaseService.info_center.next(new Info({text: '请选择至少一项资源后操作', type: Info.TYPE_WARN}));
      } else {
        if (help === 'delete') {
          this.delete_text = `删除选定的${this.operation_list.length}项资源且无法恢复。`;
          this.footBtnService.activate_btn(this.footBtnService.foot_btn_delete);
        } else {
          this.footBtnService.activate_btn(this.footBtnService.foot_btn_move);
        }
      }
    }
  }

  start_operation(callback = null, fail_call = null) {
    this.op_append_msg = '';
    this.show_op_process = true;
    this.current_op_num = 0;
    this.total_op_num = this.operation_list.length;
    // this.op_text = (this.op_identifier === 'delete') ? '删除' : (this.op_identifier === '')'移动';
    // const promise = (this.op_identifier === 'delete') ? this.recursiveDelete(op_list) : this.directMove(op_list);
    this.op_text = this.operations[this.op_identifier].text;
    const promise = this.operations[this.op_identifier].func(this.operation_list);
    promise
      .then(() => {
        BaseService.info_center.next(new Info({
          text: this.total_op_num > 1 ? '批量' : '' + this.op_text + '成功',
          type: Info.TYPE_SUCC
        }));
        if (callback) {
          callback();
        }
        setTimeout(() => {
          this.show_op_process = false;
        }, 300);
      })
      .catch(() => {
        if (fail_call) {
          fail_call();
        }
        setTimeout(() => {
          this.show_op_process = false;
        }, 300);
      });
  }

  go_search(searching: boolean) {
    this.search_mode = searching;
  }

  toggle_search_mode() {
    if (this.search_mode) {
      this.search_mode = false;
      if (this.search_value) {
        this.search_value = null;
        this.resource_search();
      }
      return;
    }
    this.search_mode = !this.search_mode;
  }

  open_search_mode() {
    if (!this.search_mode) {
      this.search_mode = true;
    }
  }

  collapse_search_mode() {
    if (!this.search_mode) {
      return;
    }
    this.search_mode = false;
    if (this.search_value) {
      this.search_value = null;
      this.resource_search();
    }
  }

  update_search_value(value: string) {
    this.search_value = value;
    this.search_terms.next(value);
  }

  clear_search() {
    this.search_value = null;
    this.resource_search();
  }

  get search_class() {
    return this.search_mode ? 'searching' : '';
  }

  get sort_class() {
    return this.sort_mode ? 'sorting' : '';
  }

  navigate(res_str_id) {
    const link = ['/res', res_str_id];
    this.baseService.is_jumping = true;
    BaseService.savePageCookie(this.res_str_id, this.scroll_top, this.search_value, this.search_mode);
    this.router.navigate(link)
      .then();
  }

  go_parent($event = null) {
    if ($event) {
      $event.stopPropagation();
    }
    if (this.resource.is_home) {
      return;
    }
    const link = ['/res', this.resource.parent_str_id];
    this.baseService.is_jumping = true;
    BaseService.savePageCookie(this.res_str_id, this.scroll_top, this.search_value, this.search_mode);
    this.router.navigate(link)
      .then();
  }

  get foot_btns() {
    const _foot_btns = [];
    for (const foot_btn of this.footBtnService.foot_btn_list) {
      if (this.resource && !foot_btn.hide) {
        if ((this.resource.is_folder && foot_btn.folder) || (!this.resource.is_folder && foot_btn.file)) {
          if (this.resource.is_home && !foot_btn.root) {
            continue;
          }
          if (foot_btn.login && !this.is_owner) {
            continue;
          }
          if (foot_btn.noLogin && this.is_owner) {
            continue;
          }
          _foot_btns.push(foot_btn);
        }
      }
    }
    return _foot_btns;
  }

  get is_owner() {
    return this.userService.user && this.resource && this.userService.user.user_id === this.resource.owner.user_id;
  }

  get dl_link() {
    const params = new URLSearchParams();
    params.set('token', BaseService.token || '');
    const visitKey = this.resolved_visit_key;
    if (visitKey) {
      params.set('visit_key', visitKey);
    }
    return `${this.baseService.host}/api/res/${this.resource.res_str_id}/dl?${params.toString()}`;
  }

  get direct_link() {
    if (!this.resource || this.resource.is_folder) {
      return null;
    }

    let link = `${this.baseService.short_link_host}/${this.resource.res_str_id}`;
    if (this.resource.rname) {
      link += `/${encodeURIComponent(this.resource.rname)}`;
    }

    if (this.resource.is_effectively_public) {
      return link;
    }

    const visitKey = this.resolved_visit_key;
    if (this.resource.is_protected && !visitKey) {
      return null;
    }
    if (this.resource.is_protected) {
      link += `?visit_key=${encodeURIComponent(visitKey)}`;
      return link;
    }

    return null;
  }

  get download_href() {
    return this.direct_link || this.dl_link;
  }

  get download_command() {
    if (!this.resource) {
      return "pocklo download";
    }

    const file_name = this.resource.rname || 'download.bin';
    return `pocklo download @${this.resource.res_str_id} "./${this.escapeCliPathSegment(file_name)}"`;
  }

  get download_directory_command() {
    if (!this.current_res_ref) {
      return 'pocklo download @resource-id ./workspace';
    }
    const directory_name = this.resource?.rname || 'workspace';
    return `pocklo download @${this.current_res_ref} "./${this.escapeCliPathSegment(directory_name)}"`;
  }

  get can_copy_direct_link() {
    return !!this.direct_link;
  }

  get download_action_text() {
    if (this.resource?.is_link) {
      return '打开目标';
    }
    return '下载资源';
  }

  get resolved_visit_key() {
    return this.resource?.visit_key || this.visit_key || ResourceService.loadVK(this.res_str_id);
  }

  get terminal_list_command() {
    if (!this.current_res_ref) {
      return "pocklo ls";
    }
    return `pocklo ls @${this.current_res_ref}`;
  }

  get parent_list_command() {
    const parent_ref = this.resource?.parent_str_id;
    if (!parent_ref || parent_ref === Resource.ROOT_ID) {
      return 'pocklo ls';
    }
    return `pocklo ls @${parent_ref}`;
  }

  get htx_command_options() {
    return [
      {value: ResComponent.HTX_DOWNLOAD_MODE, label: '下载'},
      {value: ResComponent.HTX_DISPLAY_MODE, label: '展示'},
      {value: ResComponent.HTX_MORE_MODE, label: '更多'},
    ];
  }

  get active_htx_command_label() {
    const active = this.htx_command_options.find((option) => option.value === this.htx_command_mode);
    return active?.label || '展示';
  }

  get display_command() {
    if (!this.resource) {
      return 'pocklo ls';
    }
    if (this.resource.is_folder) {
      return this.terminal_list_command;
    }
    if (this.resource.is_file || this.resource.is_link) {
      return this.parent_list_command;
    }
    return this.workspace_prompt_command;
  }

  get active_htx_command() {
    switch (this.htx_command_mode) {
      case ResComponent.HTX_DOWNLOAD_MODE:
        return this.resource?.is_folder ? this.download_directory_command : this.download_command;
      case ResComponent.HTX_DISPLAY_MODE:
      default:
        return this.display_command;
    }
  }

  get workspace_prompt_command() {
    if (!this.current_res_ref) {
      return "htx";
    }
    if (!this.resource) {
      return `htx open @${this.current_res_ref}`;
    }
    if (this.resource.is_folder) {
      return this.terminal_list_command;
    }
    if (this.resource.is_file || this.resource.is_link) {
      return this.download_command;
    }
    if (this.resource.is_protected) {
      return `htx access @${this.current_res_ref}`;
    }
    if (this.resource.is_private) {
      return `htx open @${this.current_res_ref}`;
    }
    return `htx inspect @${this.current_res_ref}`;
  }

  toggle_htx_menu(event?: Event) {
    event?.stopPropagation();
    this.is_htx_menu_open = !this.is_htx_menu_open;
  }

  select_htx_command_mode(mode: string, event?: Event) {
    event?.stopPropagation();
    this.is_htx_menu_open = false;
    if (mode === ResComponent.HTX_MORE_MODE) {
      const cliUrl = this.router.serializeUrl(this.router.createUrlTree(['/cli']));
      window.open(cliUrl, '_blank', 'noopener');
      return;
    }
    this.htx_command_mode = mode;
  }

  get sort_name_active() {
    return ResComponent.sort_accord === 'name';
  }

  get sort_time_active() {
    return ResComponent.sort_accord === 'time';
  }

  get sort_type_active() {
    return ResComponent.sort_accord === 'type';
  }

  get sort_direction() {
    return ResComponent.sort_ascend ? '↑' : '↓';
  }

  get time_header_label() {
    return ResComponent.relative_time ? '相对时间' : '绝对时间';
  }

  get time_toggle_icon() {
    return ResComponent.relative_time ? 'icon-toggleon' : 'icon-toggleoff';
  }

  resource_time(resource: Resource) {
    if (!resource) {
      return '-';
    }
    return ResComponent.relative_time ? resource.readable_time : resource.absolute_time;
  }

  toggle_time_display(event?: Event) {
    event?.stopPropagation();
    ResComponent.relative_time = !ResComponent.relative_time;
  }

  sort_state(accord: string) {
    if (ResComponent.sort_accord !== accord) {
      return 'inactive';
    }
    return ResComponent.sort_ascend ? 'asc' : 'desc';
  }

  private escapeCliPathSegment(name: string) {
    return name
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  private default_htx_command_mode() {
    return ResComponent.HTX_DISPLAY_MODE;
  }

  private reset_htx_command_mode() {
    this.htx_command_mode = this.default_htx_command_mode();
    this.is_htx_menu_open = false;
  }

  switch_tab_mode(tm: string) {
    this.tab_mode = tm;
  }

  sort_by_new_created(_: Resource, rb: Resource) {
    if (_.new_created === rb.new_created) {
      return 0;
    }
    return _.new_created ? -1 : 1;
  }

  sort_by_time(ra: Resource, rb: Resource) {
    if (ResComponent.sort_ascend) {
      return ra.create_time - rb.create_time;
    } else {
      return rb.create_time - ra.create_time;
    }
  }

  sort_by_type(ra: Resource, rb: Resource) {
    if (ResComponent.sort_ascend) {
      return ra.sub_type - rb.sub_type;
    } else {
      return rb.sub_type - ra.sub_type;
    }
  }

  sort_by_name(ra: Resource, rb: Resource) {
    if (ResComponent.sort_ascend) {
      return ra.rname.localeCompare(rb.rname, 'zh');
    } else {
      return -ra.rname.localeCompare(rb.rname, 'zh');
    }
  }

  sort_by_size(ra: Resource, rb: Resource) {
    const left = typeof ra.rsize === 'number' ? ra.rsize : -1;
    const right = typeof rb.rsize === 'number' ? rb.rsize : -1;
    if (ResComponent.sort_ascend) {
      return left - right;
    } else {
      return right - left;
    }
  }

  sort_by(follow_last, accord = null) {
    if (!follow_last) {
      if (ResComponent.sort_accord === accord) {
        ResComponent.sort_ascend = !ResComponent.sort_ascend;
      } else {
        ResComponent.sort_accord = accord;
        ResComponent.sort_ascend = true;
      }
    }
    switch (ResComponent.sort_accord) {
      case 'time':
        this.search_list.sort(this.sort_by_time);
        break;
      case 'name':
        this.search_list.sort(this.sort_by_name);
        break;
      case 'size':
        this.search_list.sort(this.sort_by_size);
        break;
      case 'type':
        this.search_list.sort(this.sort_by_type);
        break;
      default:
        break;
    }
    this.search_list.sort(this.sort_by_new_created);
    this.sort_mode = false;
    this.ensure_gallery_focus();
  }

  get show_back_icon() {
    return this.tab_mode === 'description' && !this.modify_desc;
  }

  copy_error() {
    BaseService.info_center.next(new Info({text: '复制失败', type: Info.TYPE_WARN}));
  }

  copy_succ(text = '复制成功') {
    BaseService.info_center.next(new Info({text, type: Info.TYPE_SUCC}));
  }

  activate_btn(btn: FootBtn) {
    this.is_multi_mode = false;
    this.footBtnService.activate_btn(btn);
    if (this.footBtnService.is_selecting) {
      this.tab_mode = "resource";
    } else if (this.footBtnService.is_deleting) {
      this.operation_list = [new OperationResItem({
        res_str_id: this.resource.res_str_id,
        readablePath: this.resource.rname,
      })];
      if (this.resource && this.resource.rtype === Resource.RTYPE_FILE) {
        this.delete_text = '删除此资源且无法恢复。';
      } else {
        this.delete_text = '删除此文件夹下的所有资源和子文件夹且无法恢复。';
      }
    } else if (this.footBtnService.is_moving) {
      this.resTreeService.show_res_path(this.res_str_id, false);
      this.operation_list = [new OperationResItem({
        res_str_id: this.resource.res_str_id,
        readablePath: this.resource.rname,
      })];
      if (this.res_str_id === ResourceTreeService.selectResStrId) {
        ResourceTreeService.selectResStrId = ResourceTreeService.selectedResName = null;
      }
    }
  }

  cancel_modify_desc() {
    if (this.resource) {
      this.description = this.resource.description;
    } else {
      this.description = '';
    }
    this.modify_desc = false;
  }

  modify_desc_action() {
    this.resService.modify_res_info(this.res_str_id,
      {rname: null, description: this.description, visit_key: null, status: null, right_bubble: null, parent_str_id: null})
      .then((resp) => {
        this.resource.update(null, resp);
        this.description = this.resource.description;
        // this.footBtnService.inactivate();
        this.modify_desc = false;
      });
  }

  addChildRes(res: Resource) {
    res.new_created = true;
    this.children.push(res);
    this.resource_search();
    this.maybe_auto_enter_gallery();
  }

  removeChildren(res_str_ids: string[]) {
    if (!res_str_ids.length) {
      return;
    }
    this.children = this.children.filter((item) => !res_str_ids.includes(item.res_str_id));
    this.search_list = this.search_list.filter((item) => !res_str_ids.includes(item.res_str_id));
    this.maybe_auto_enter_gallery();
    this.ensure_gallery_focus();
  }

  onUploadFolder(data: any) {
    const res_folder: FileList = data.res_folder;
    this.operation_list = [];

    for (let index = 0; index < res_folder.length; index++) {
      const res = res_folder[index];
      this.operation_list.push(new OperationResItem({
        res_str_id: null,
        readablePath: res.webkitRelativePath.replace('/', ' / '),
      }, res));
    }

    this.op_identifier = 'upload-folder';
    this.footBtnService.inactivate();
    this.start_operation(data.callback);
  }

  onUpload(data: any) {
    const upload_entries = data.upload_entries;
    const res_files = data.res_files;
    const file_name = data.file_name;
    this.operation_list = [];
    if (upload_entries && upload_entries.length) {
      for (const entry of upload_entries) {
        this.operation_list.push(new OperationResItem({
          res_str_id: null,
          readablePath: entry.name,
        }, entry.file));
      }
    } else if (res_files.length === 1) {
      this.operation_list.push(new OperationResItem({
        res_str_id: null,
        readablePath: file_name,
      }, res_files[0]));
    } else {
      for (let index = 0; index < res_files.length; index++) {
        const res = res_files[index];
        this.operation_list.push(new OperationResItem({
          res_str_id: null,
          readablePath: res.name,
        }, res));
      }
    }

    this.op_identifier = 'upload';
    this.footBtnService.inactivate();
    this.start_operation(data.callback);
  }

  private upload_source_file(upload_res_item: OperationResItem) {
    return upload_res_item.data?.file || upload_res_item.data;
  }

  private upload_source_name(upload_res_item: OperationResItem) {
    return upload_res_item.data?.name || this.upload_source_file(upload_res_item)?.name || upload_res_item.readablePath;
  }

  private upload_relative_path(upload_res_item: OperationResItem) {
    return upload_res_item.data?.webkitRelativePath || upload_res_item.readablePath;
  }

  private reset_drag_upload_state() {
    this.show_drag_upload_overlay = false;
    this.drag_upload_depth = 0;
  }

  private is_file_drag(event: DragEvent) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  }

  private async collect_drag_upload_items(dataTransfer: DataTransfer | null): Promise<DragUploadItem[]> {
    if (!dataTransfer) {
      return [];
    }
    const items = Array.from(dataTransfer.items || []);
    const root_entries = items
      .map((item) => (item as any).webkitGetAsEntry?.())
      .filter((entry) => !!entry);

    if (root_entries.length) {
      const entries: DragUploadItem[] = [];
      for (const entry of root_entries) {
        await this.walk_drag_entry(entry, '', entries);
      }
      return entries;
    }

    return Array.from(dataTransfer.files || []).map((file) => ({
      file,
      relativePath: file.name,
    }));
  }

  private async walk_drag_entry(entry: any, parent_path: string, result: DragUploadItem[]) {
    if (!entry) {
      return;
    }
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      const relative_path = parent_path ? `${parent_path}/${file.name}` : file.name;
      result.push({file, relativePath: relative_path});
      return;
    }
    if (!entry.isDirectory) {
      return;
    }
    const next_path = parent_path ? `${parent_path}/${entry.name}` : entry.name;
    const children = await this.read_drag_directory_entries(entry.createReader());
    for (const child of children) {
      await this.walk_drag_entry(child, next_path, result);
    }
  }

  private async read_drag_directory_entries(reader: any) {
    const entries = [];
    while (true) {
      const batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) {
        break;
      }
      entries.push(...batch);
    }
    return entries;
  }

  private queue_drag_upload(items: DragUploadItem[]) {
    const has_directory_path = items.some((item) => item.relativePath.includes('/'));
    this.operation_list = items.map((item) => new OperationResItem({
      res_str_id: null,
      readablePath: item.relativePath.replace(/\//g, ' / '),
    }, has_directory_path ? {
      file: item.file,
      name: item.file.name,
      webkitRelativePath: item.relativePath,
    } : item.file));

    this.op_identifier = has_directory_path ? 'upload-folder' : 'upload';
    this.footBtnService.inactivate();
    BaseService.info_center.next(new Info({
      text: `检测到${items.length}个拖拽资源，开始上传`,
      type: Info.TYPE_SUCC,
    }));
    this.start_operation();
  }

  onDeleted() {
    if (this.operation_list.length === 0) {
      return;
    }

    this.op_identifier = 'delete';
    this.start_operation( () => {
      const deleted_res_ids = this.operation_list
        .map((item) => item.resId)
        .filter((item) => !!item);
      this.removeChildren(deleted_res_ids);
      this.operation_list = [];
      if (!this.is_multi_mode) {
        this.go_parent();
      } else {
        this.resService.get_res_info(this.res_str_id, null)
          .then((resp) => {
            this.baseInitResource(resp);
            this.resTreeService.refresh_node(this.resTreeService.root);
          });
      }
    });
  }

  onMove() {
    if (this.operation_list.length === 0) {
      return;
    }

    this.op_identifier = 'move';
    this.start_operation(() => {
      this.operation_list = [];
      this.resService.get_res_info(this.res_str_id, null)
        .then((resp) => {
          this.baseInitResource(resp);
          this.resTreeService.refresh_node(this.resTreeService.root);
        });
    });
  }

  get resource_title() {
    if (this.search_value && this.resource && this.resource.rtype === Resource.RTYPE_FOLDER) {
      let _v = '';
      if (this.search_value.length > 2) {
        _v = this.search_value.substr(0, 2) + '…';
      } else {
        _v = this.search_value;
      }
      return `搜索“${_v}”的结果`;
    }
    return '目录';
  }

  get folder_view_options() {
    return [
      {value: ResComponent.VIEW_LIST, label: '列表'},
      {value: ResComponent.VIEW_COLUMN, label: '分栏'},
      {value: ResComponent.VIEW_GALLERY, label: '画廊'},
    ];
  }

  get is_list_view() {
    return this.folder_view_mode === ResComponent.VIEW_LIST;
  }

  get is_column_view() {
    return this.folder_view_mode === ResComponent.VIEW_COLUMN;
  }

  get is_gallery_view() {
    return this.folder_view_mode === ResComponent.VIEW_GALLERY;
  }

  get current_gallery_resource() {
    if (!this.search_list?.length) {
      return null;
    }
    return this.search_list.find((item) => item.res_str_id === this.active_gallery_res_id) || this.search_list[0];
  }

  resource_type_label(resource: Resource) {
    if (!resource) {
      return 'resource';
    }
    if (resource.is_folder) {
      return 'folder';
    }
    if (resource.is_image) {
      return 'image';
    }
    if (resource.is_pdf) {
      return 'pdf';
    }
    if (resource.is_music) {
      return 'audio';
    }
    if (resource.is_video) {
      return 'video';
    }
    if (resource.is_link) {
      return 'link';
    }
    return 'file';
  }

  resource_preview_href(resource: Resource) {
    return this.resource_direct_href(resource) || this.resource_api_href(resource);
  }

  resource_image_src(resource: Resource, quality: 'thumb' | 'full' = 'thumb') {
    if (!resource) {
      return '';
    }
    if (quality === 'full' && resource.cover) {
      return resource.cover;
    }
    if (resource.cover_small) {
      return resource.cover_small;
    }
    if (resource.cover) {
      return resource.cover;
    }
    return this.resource_preview_href(resource);
  }

  resource_pdf_preview_href(resource: Resource): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(`${this.resource_preview_href(resource)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`);
  }

  has_column_thumbnail(resource: Resource) {
    return !!(resource?.is_image && (resource.cover_small || resource.cover));
  }

  has_gallery_image(resource: Resource) {
    return !!(resource?.is_image && (resource.cover || resource.cover_small));
  }

  has_gallery_pdf(resource: Resource) {
    return !!resource?.is_pdf;
  }

  has_gallery_audio(resource: Resource) {
    return !!resource?.is_music;
  }

  is_gallery_previewable(resource: Resource) {
    return this.has_gallery_image(resource) || this.has_gallery_pdf(resource) || this.has_gallery_audio(resource);
  }

  card_preview_mode(resource: Resource) {
    if (this.is_gallery_view) {
      if (this.has_gallery_image(resource)) {
        return 'image';
      }
      if (this.has_gallery_pdf(resource)) {
        return 'pdf';
      }
      if (this.has_gallery_audio(resource)) {
        return 'audio';
      }
    }
    if (this.is_column_view && this.has_column_thumbnail(resource)) {
      return 'thumb';
    }
    return 'icon';
  }

  gallery_stage_preview_mode(resource: Resource) {
    if (this.has_gallery_image(resource)) {
      return 'image';
    }
    if (this.has_gallery_pdf(resource)) {
      return 'pdf';
    }
    if (this.has_gallery_audio(resource)) {
      return 'audio';
    }
    return 'icon';
  }

  gallery_strip_preview_mode(resource: Resource) {
    if (resource?.is_image) {
      return 'thumb';
    }
    return 'icon';
  }

  focus_gallery_resource(resource: Resource, event?: Event) {
    event?.stopPropagation();
    if (!resource) {
      return;
    }
    if (this.has_selection) {
      this.select_res(resource, event);
      return;
    }
    this.active_gallery_res_id = resource.res_str_id;
  }

  gallery_open_action_text(resource: Resource) {
    return resource?.is_folder ? '进入目录' : '打开详情';
  }

  private resource_api_href(resource: Resource) {
    if (!resource) {
      return '';
    }
    const params = new URLSearchParams();
    params.set('token', BaseService.token || '');
    const visit_key = resource.visit_key || this.resolved_visit_key;
    if (visit_key) {
      params.set('visit_key', visit_key);
    }
    return `${this.baseService.host}/api/res/${resource.res_str_id}/dl?${params.toString()}`;
  }

  private resource_direct_href(resource: Resource) {
    if (!resource || resource.is_folder) {
      return null;
    }

    let link = `${this.baseService.short_link_host}/${resource.res_str_id}`;
    if (resource.rname) {
      link += `/${encodeURIComponent(resource.rname)}`;
    }

    if (resource.is_effectively_public) {
      return link;
    }

    const visit_key = resource.visit_key || this.resolved_visit_key;
    if (resource.is_protected && visit_key) {
      return `${link}?visit_key=${encodeURIComponent(visit_key)}`;
    }

    return null;
  }

  get current_res_ref() {
    return this.resource?.res_str_id || this.res_str_id || '';
  }

  get show_selection_column() {
    return !!(this.is_owner && this.resource?.is_folder);
  }

  is_name_overflowing(res_id: string) {
    return !!this.name_overflow_states[res_id]?.overflowing;
  }

  name_shift(res_id: string) {
    return this.name_overflow_states[res_id]?.shift || 0;
  }

  get selected_count() {
    return this.search_list.filter((item) => item.selected).length;
  }

  private ensure_gallery_focus() {
    if (!this.search_list?.length) {
      this.active_gallery_res_id = '';
      return;
    }
    if (!this.active_gallery_res_id || !this.search_list.some((item) => item.res_str_id === this.active_gallery_res_id)) {
      this.active_gallery_res_id = this.search_list[0].res_str_id;
    }
  }

  private maybe_auto_enter_gallery() {
    if (!this.children?.length) {
      return;
    }
    const previewable_count = this.children.filter((item) => this.is_gallery_previewable(item)).length;
    if (previewable_count / this.children.length <= 0.5) {
      return;
    }
    this.folder_view_mode = ResComponent.VIEW_GALLERY;
    window.localStorage.setItem(ResComponent.FOLDER_VIEW_STORAGE_KEY, ResComponent.VIEW_GALLERY);
    this.ensure_gallery_focus();
  }

  private schedule_name_overflow_refresh() {
    if (this.pending_name_overflow_refresh) {
      return;
    }
    this.pending_name_overflow_refresh = true;
    setTimeout(() => {
      this.pending_name_overflow_refresh = false;
      this.refresh_name_overflow();
    });
  }

  private refresh_name_overflow() {
    if (!this.resNameViewportRefs || !this.resNameTextRefs) {
      return;
    }
    const next_states = {};
    const viewports = this.resNameViewportRefs.toArray();
    const texts = this.resNameTextRefs.toArray();
    viewports.forEach((viewport_ref, index) => {
      const viewport = viewport_ref.nativeElement;
      const text = texts[index]?.nativeElement;
      const res_id = viewport.dataset.resId || text?.dataset.resId;
      if (!res_id || !text) {
        return;
      }
      const overflow = Math.max(text.scrollWidth - viewport.clientWidth, 0);
      next_states[res_id] = {
        overflowing: overflow > 6,
        shift: -overflow,
      };
    });
    this.name_overflow_states = next_states;
  }

  get has_selection() {
    return this.selected_count > 0;
  }

  get all_search_list_selected() {
    return this.search_list.length > 0 && this.search_list.every((item) => item.selected);
  }

  get selection_header_icon() {
    return this.all_search_list_selected ? 'icon-check' : 'icon-uncheck';
  }

  get visibility_headline() {
    if (!this.resource) {
      return '';
    }
    if (!this.resource.is_secure_env) {
      return '实际公开';
    }
    if (this.resource.is_protected) {
      return '加密分享';
    }
    if (this.resource.is_private) {
      return '私有资源';
    }
    return '公开资源';
  }

  get visibility_detail() {
    if (!this.resource) {
      return '';
    }
    if (!this.resource.is_secure_env) {
      return `当前资源保持附属模式，因祖先目录“${this.resource.insecure_parent}”公开，访问效果等同公开资源。`;
    }
    if (this.resource.is_protected) {
      return '访客需要访问密码。页面直链会自动带 visit_key，适合一次性分发。';
    }
    if (this.resource.is_private) {
      return '只有当前账号体系内有权限的用户可以访问，页面不会暴露公开直链。';
    }
    return '任何拿到直链或页面链接的访客都可以直接访问此资源。';
  }

  get visibility_tone() {
    if (!this.resource) {
      return 'public';
    }
    if (!this.resource.is_secure_env) {
      return 'warn';
    }
    if (this.resource.is_protected) {
      return 'protect';
    }
    if (this.resource.is_private) {
      return 'private';
    }
    return 'public';
  }

  open_share_settings(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.open_inspector_action(this.footBtnService.foot_btn_share);
  }

  show_resource_mode_info(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    BaseService.info_center.next(new Info({
      text: `附属模式：共享父资源的访问范围，能访问父资源就能访问我。\n独立模式：单独决定公开、加密或私有，不受父资源分享状态影响。`,
      type: Info.TYPE_WARN,
    }));
  }

  set_resource_mode(right_bubble: boolean, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.is_owner || !this.resource || this.resource_mode_updating || this.resource.right_bubble === right_bubble) {
      return;
    }
    this.resource_mode_updating = true;
    this.resService.modify_res_info(this.res_str_id,
      {status: null, visit_key: null, description: null, rname: null, right_bubble, parent_str_id: null})
      .then((resp) => {
        this.resource.update(null, resp);
        BaseService.info_center.next(new Info({text: `已切换为${right_bubble ? '附属模式' : '独立模式'}`, type: Info.TYPE_SUCC}));
      })
      .catch(() => null)
      .finally(() => {
        this.resource_mode_updating = false;
      });
  }

  get readme_empty_hint() {
    if (this.is_owner) {
      return '补一段用途、下载方式或命令说明，这个资源页会清楚很多。';
    }
    return '当前资源还没有附带 README。';
  }

  open_readme_editor() {
    this.modify_desc = true;
    this.tab_mode = 'description';
  }

  open_rename_modal() {
    this.is_multi_mode = false;
    this.footBtnService.open_btn(this.footBtnService.foot_btn_rename);
  }

  open_inspector_action(btn: FootBtn) {
    this.is_multi_mode = false;
    this.footBtnService.open_btn(btn);
    if (this.footBtnService.is_deleting) {
      this.operation_list = [new OperationResItem({
        res_str_id: this.resource.res_str_id,
        readablePath: this.resource.rname,
      })];
      if (this.resource && this.resource.rtype === Resource.RTYPE_FILE) {
        this.delete_text = '删除此资源且无法恢复。';
      } else {
        this.delete_text = '删除此文件夹下的所有资源和子文件夹且无法恢复。';
      }
    } else if (this.footBtnService.is_moving) {
      this.resTreeService.show_res_path(this.res_str_id, false);
      this.operation_list = [new OperationResItem({
        res_str_id: this.resource.res_str_id,
        readablePath: this.resource.rname,
      })];
      if (this.res_str_id === ResourceTreeService.selectResStrId) {
        ResourceTreeService.selectResStrId = ResourceTreeService.selectedResName = null;
      }
    }
  }

  show_insecure_info() {
    if (!this.resource) {
      return;
    }
    BaseService.info_center.next(new Info({text: this.resource.secure_info, type: Info.TYPE_WARN}));
  }

  get is_mine() {
    return this.resource && this.userService.user && this.userService.user.user_id === this.resource.owner.user_id;
  }

  get can_drag_upload() {
    return !!(this.is_owner && this.resource?.is_folder);
  }

  go_login() {
    if (this.userService.user) {
      this.router.navigate(['/res']);
    } else {
      window.location.href = this.userService.oauth_uri + '&state=' + encodeURI(this.router.url);
    }
  }

  check_visit_key() {
    this.resService.get_res_info(this.res_str_id, {visit_key: this.visit_key})
      .then((resp) => {
        ResourceService.storeVK(this.res_str_id, this.visit_key);
        this.baseInitResource(resp);
        BaseService.info_center.next(new Info({text: '成功获取资源', type: Info.TYPE_SUCC}));
      });
  }
}
