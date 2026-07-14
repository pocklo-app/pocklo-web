import {environment} from "../../../environments/environment";

export class User {
  private static readonly FALLBACK_AVATAR = "https://unsplash.6-79.cn/random/small";
  private static readonly QT_HOST = environment.qtOrigin;

  user_id: number;
  nickname: string;
  avatar: string;
  rootRes: string;

  constructor(d: {user_id, nickname, avatar, root_res} = null) {
    if (d) {
      this.update(d);
    }
  }

  update(d: {user_id, nickname, avatar, root_res}) {
    this.user_id = d.user_id;
    this.nickname = d.nickname;
    this.avatar = d.avatar;
    this.rootRes = d.root_res;
  }

  get avatar_src() {
    if (!this.avatar) {
      return User.FALLBACK_AVATAR;
    }
    if (this.avatar.startsWith("//")) {
      return `https:${this.avatar}`;
    }
    if (this.avatar.startsWith("/")) {
      return `${User.QT_HOST}${this.avatar}`;
    }
    return this.avatar;
  }

  get url_avatar() {
    return `url('${this.avatar_src}')`;
  }
}
