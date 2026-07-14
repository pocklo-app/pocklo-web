import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import {UserService} from "../../services/user.service";
import {Resource} from "../../models/res/resource";
import {Router} from "@angular/router";
import {FootBtnService} from "../../services/foot-btn.service";
import {environment} from "../../../environments/environment";

@Component({
  selector: 'app-res-nav',
  templateUrl: './res-nav.component.html',
  styleUrls: [
    '../../../assets/css/icon-fonts.css',
    '../../../assets/css/nav.less',
  ]
})
export class ResNavComponent implements AfterViewInit, OnChanges {
  @Input() resource: Resource;
  @Input() is_mine: boolean;
  @Input() zip_nav: boolean;
  @Input() search_mode: boolean;
  @Input() search_value: string;
  @ViewChild('searchInput') searchInputRef: ElementRef<HTMLInputElement>;
  @ViewChild('titleViewport') titleViewportRef: ElementRef<HTMLDivElement>;
  @ViewChild('titleTrack') titleTrackRef: ElementRef<HTMLDivElement>;
  @ViewChild('titleText') titleTextRef: ElementRef<HTMLDivElement>;
  @Output() onGoParent = new EventEmitter();
  @Output() onGoLogin = new EventEmitter();
  @Output() onOpenSearch = new EventEmitter<void>();
  @Output() onCollapseSearch = new EventEmitter<void>();
  @Output() onSearchValue = new EventEmitter<string>();
  @Output() onClearSearch = new EventEmitter<void>();
  @Output() onOpenRename = new EventEmitter<void>();
  show_menu: boolean;
  pending_search_focus: boolean;
  title_is_overflowing: boolean;
  title_shift: number;

  constructor(
    public userService: UserService,
    public footBtnService: FootBtnService,
    public router: Router,
  ) {
    this.show_menu = false;
    this.pending_search_focus = false;
    this.title_is_overflowing = false;
    this.title_shift = 0;
  }

  ngAfterViewInit() {
    this.refresh_title_overflow();
    this.focus_search_if_needed();
  }

  ngOnChanges(_: SimpleChanges) {
    setTimeout(() => {
      this.refresh_title_overflow();
      this.focus_search_if_needed();
    });
  }

  dismiss_menu() {
    if (this.show_menu) {
      this.show_menu = false;
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.refresh_title_overflow();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (!this.show_search_control || this.isEditableTarget(event.target)) {
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      this.open_search(event);
      return;
    }
    if (event.key === 'Escape' && this.search_mode) {
      event.preventDefault();
      this.collapse_search(event);
    }
  }

  open_rename($event?: Event) {
    $event?.preventDefault();
    $event?.stopPropagation();
    if (!this.is_mine || !this.resource) {
      return;
    }
    this.onOpenRename.emit();
  }

  open_search($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    this.pending_search_focus = true;
    if (!this.search_mode) {
      this.onOpenSearch.emit();
      return;
    }
    this.focus_search_if_needed();
  }

  collapse_search($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    if (!this.search_mode) {
      return;
    }
    this.onCollapseSearch.emit();
  }

  update_search(value: string, $event = null) {
    if ($event) {
      $event.cancelBubble = true;
      $event.stopPropagation();
    }
    this.onSearchValue.emit(value);
  }

  clear_search($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    this.onClearSearch.emit();
    this.pending_search_focus = false;
    this.onCollapseSearch.emit();
  }

  on_search_blur() {
    if (this.search_value) {
      return;
    }
    this.onCollapseSearch.emit();
  }

  go_parent($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    this.onGoParent.emit();
  }

  go_login($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    // this.router.navigate(['/user', 'login', 'next', this.router.url]);
    window.location.href = this.userService.oauth_uri + '&state=' + encodeURI(this.router.url);
  }

  click_avatar($event) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    this.show_menu = !this.show_menu;
  }

  menu_handler($event, s: string) {
    $event.cancelBubble = true;
    $event.stopPropagation();
    if (s === 'mine') {
      this.router.navigate(['/res', this.userService.user.rootRes]);
    } else if (s === 'profile') {
      const from = encodeURIComponent(`${window.location.origin || environment.diskFrontendOrigin}/user/refresh`);
      window.location.href = `${environment.qtOrigin}/user/info-modify?from=${from}`;
    } else if (s === 'code') {
      window.open('https://github.com/lqj679ssn/disk-frontend');
    } else if (s === 'tips') {
      this.show_menu = false;
      this.footBtnService.activate_btn(this.footBtnService.foot_btn_tips);
    } else if (s === 'updates') {
      this.show_menu = false;
      this.footBtnService.activate_btn(this.footBtnService.foot_btn_update);
    }
  }

  get show_search_control() {
    return !!this.resource?.is_folder;
  }

  private focus_search_if_needed() {
    if (!this.pending_search_focus || !this.search_mode || !this.searchInputRef) {
      return;
    }
    const input = this.searchInputRef.nativeElement;
    input.focus();
    input.select();
    this.pending_search_focus = false;
  }

  private refresh_title_overflow() {
    if (!this.titleViewportRef || !this.titleTrackRef || !this.titleTextRef) {
      return;
    }
    const viewport = this.titleViewportRef.nativeElement;
    const title = this.titleTextRef.nativeElement;
    const overflow = Math.max(title.scrollWidth - viewport.clientWidth, 0);
    this.title_shift = -overflow;
    this.title_is_overflowing = overflow > 6;
  }

  private isEditableTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    if (!element) {
      return false;
    }
    const tag_name = element.tagName?.toLowerCase();
    return !!(element.isContentEditable || tag_name === 'input' || tag_name === 'textarea');
  }
}
