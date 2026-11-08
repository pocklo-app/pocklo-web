import {Injectable} from "@angular/core";
import {BaseService} from "./base.service";
import {User} from "../models/user/user";
import {Subject} from "rxjs";
import {ResourceTreeService} from "./resource-tree.service";
import {environment} from "../../environments/environment";

@Injectable()
export class UserService {
  public oauth_uri = `${environment.qtOrigin}/oauth/?app_id=${environment.oauthAppId}`;
  public user: User;
  public user_update_center = new Subject<User>();
  public has_get_user: boolean;

  constructor(
    private baseService: BaseService,
    private resTreeService: ResourceTreeService,
  ) {
    BaseService.token = BaseService.loadToken();
    this.user = null;
    this.has_get_user = false;
  }

  public exit() {
    window.localStorage.removeItem('token');
    this.user = null;
    BaseService.token = null;
  }

  public acceptLogin(session: { token: string; user: any }) {
    BaseService.saveToken(session.token);
    return this.setUser(session.user);
  }

  private setUser(body: any) {
    this.user = new User(body);
    this.has_get_user = true;
    this.resTreeService.init_root(this.user.rootRes);
    this.user_update_center.next(this.user);
    return this.user;
  }

  public api_get_info() {
    const token = BaseService.token;
    return this.baseService.get('/api/user/')
      .then(body => token === BaseService.token ? this.setUser(body) : this.user)
      .catch(error => {
        if (token === BaseService.token) {
          BaseService.token = null;
          this.user = null;
          this.has_get_user = true;
          this.user_update_center.next(null);
        }
        throw error;
      });
  }

  public api_qtb_oauth_check(data: {code: string}) {
    return this.baseService
      .get('/api/oauth/qtb/callback', data);
  }

  get has_login() {
    return this.user;
  }
}
