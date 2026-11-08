import {Injectable} from "@angular/core";
import {HttpClient, HttpEventType, HttpHeaders, HttpRequest, HttpResponse} from "@angular/common/http";
import {Resp} from "../models/base/resp";
import {firstValueFrom, Observable, Subject} from "rxjs";
import {filter, map, tap} from "rxjs/operators";
import {Info} from "../models/base/info";
import {environment} from "../../environments/environment";

@Injectable()
export class BaseService {
  public static asyc_working = 0;
  public static info_center = new Subject<Info>();
  public static token: string = null;
  public static relogin_warn = '应用权限变更，需要重新授权';
  public front_host: string;
  public host: string;
  public short_link_host: string;
  private qn_host: string;
  public is_jumping: boolean;

  constructor(
    private http: HttpClient,
  ) {
    this.front_host = window.location.origin;
    this.host = environment.apiOrigin;
    this.qn_host = "https://up.qiniup.com";
    this.short_link_host = "https://s.6-79.cn";
    // this.token = null;
    this.is_jumping = false;
  }
  static saveToken(token) {
    window.localStorage.setItem('token', token);
    this.token = token;
  }
  static loadToken() {
    const token = window.localStorage.getItem('token');
    this.token = token;
    return token;
  }
  static savePageCookie(res_str_id, scroll, kw, search_mode = false) {
    window.localStorage.setItem('scroll-' + res_str_id, scroll);
    if (kw) {
      window.localStorage.setItem('kw-' + res_str_id, kw);
    } else {
      window.localStorage.removeItem('kw-' + res_str_id);
    }
    if (search_mode) {
      window.localStorage.setItem('search-mode-' + res_str_id, '1');
    } else {
      window.localStorage.removeItem('search-mode-' + res_str_id);
    }
  }
  static loadPageCookie(res_str_id) {
    const scroll = window.localStorage.getItem('scroll-' + res_str_id);
    const kw = window.localStorage.getItem('kw-' + res_str_id);
    const search_mode = window.localStorage.getItem('search-mode-' + res_str_id) === '1';
    return {scroll: scroll, kw: kw, search_mode: search_mode};
  }
  private static handleError(error: any): Promise<any> {
    BaseService.asyc_working -= 1;
    console.error(error);
    return Promise.reject(error);
  }
  private static handleHTTP(o: Observable<Object>) {
    return firstValueFrom(o)
      .then((resp: Resp) => {
        if (resp.code !== 0) {
          // return BaseService.handleError(resp.msg);
          BaseService.info_center.next(new Info({text: resp.msg, type: Info.TYPE_WARN}));
          return Promise.reject(resp.msg);
        } else {
          BaseService.asyc_working -= 1;
          return resp.body;
        }
      })
      .catch(BaseService.handleError);
  }

  static isSSOServer(url: string) {
    return url[0] === '/';
  }

  fillUrl(url: string) {
    if (BaseService.isSSOServer(url)) {
      return this.host + url;
    } else {
      return url;
    }
  }

  get_option(data = {}) {
    // console.log('base token: ' + BaseService.token);
    const httpHeaders = new HttpHeaders({'Token': BaseService.token || ''});
    // httpHeaders.append('Token', this.get_token());
    return {
      headers: httpHeaders,
      params: data,
    };
  }
  get(url: string, data: object = null) {
    BaseService.asyc_working += 1;
    return BaseService.handleHTTP(this.http.get(this.fillUrl(url), this.get_option(data)));
  }
  post(url: string, data) {
    BaseService.asyc_working += 1;
    return BaseService.handleHTTP(this.http.post(this.fillUrl(url), data, this.get_option()));
  }
  put(url: string, data) {
    BaseService.asyc_working += 1;
    return BaseService.handleHTTP(this.http.put(this.fillUrl(url), data, this.get_option()));
  }
  del(url: string) {
    BaseService.asyc_working += 1;
    return BaseService.handleHTTP(this.http.delete(this.fillUrl(url), this.get_option()));
  }
  random_image() {
    BaseService.asyc_working += 1;
    return BaseService.handleHTTP(this.http.get('https://unsplash.6-79.cn/random/info'));
  }
  get is_loading() {
    return BaseService.asyc_working > 0;
  }

  public api_upload_file(key: string, token: string, file: File, progress_callback) {
    const fd = new FormData();
    fd.append('key', key);
    fd.append('token', token);
    fd.append('file', file);
    return this.post_qn(fd, progress_callback);
  }
  post_qn(data, progress_callback) {
    BaseService.asyc_working += 1;
    const request = new HttpRequest<Resp>('POST', this.qn_host, data, {
      reportProgress: true,
      responseType: 'json',
    });
    return firstValueFrom(this.http.request<Resp>(request).pipe(
      tap((event) => {
        if (event.type === HttpEventType.UploadProgress && event.total && progress_callback) {
          progress_callback({
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      }),
      filter((event): event is HttpResponse<Resp> => event instanceof HttpResponse),
      map((event) => event.body as Resp),
    ))
      .then((resp: Resp) => {
        if (resp.code !== 0) {
          // return BaseService.handleError(resp.msg);
          BaseService.info_center.next(new Info({text: resp.msg, type: Info.TYPE_WARN}));
          return Promise.reject(resp.msg);
        } else {
          BaseService.asyc_working -= 1;
          return resp.body;
        }
      })
      .catch(BaseService.handleError);
  }

  get cover_show() {
    return !window.localStorage.getItem('cover-normal');
  }

  get desc_more() {
    return !!window.localStorage.getItem('desc-more');
  }

  toggle_desc_more() {
    if (this.desc_more) {
      window.localStorage.removeItem('desc-more');
    } else {
      window.localStorage.setItem('desc-more', '1');
    }
  }
}
