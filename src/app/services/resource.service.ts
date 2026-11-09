import {Injectable} from "@angular/core";
import {BaseService} from "./base.service";

@Injectable()
export class ResourceService {
  zip_nav: boolean;

  constructor(private baseService: BaseService) {
    this.refresh_zip_nav();
  }

  public static storeVK(path: string, visit_key) {
    window.localStorage.setItem(`vk-${path}`, visit_key);
  }

  public static loadVK(path: string) {
    return window.localStorage.getItem(`vk-${path}`);
  }

  public static clearVK(path: string) {
    window.localStorage.removeItem(`vk-${path}`);
  }

  public refresh_zip_nav() {
    this.zip_nav = !window.localStorage.getItem('normal-nav');
  }

  public get_upload_token(res_str_id: string, data: {filename: string}) {
    return this.baseService
      .get(`/api/res/${res_str_id}/token`, data);
  }

  public get_cover_token(res_str_id: string, data: {filename: string}) {
    return this.baseService
      .get(`/api/res/${res_str_id}/cover`, data);
  }

  public get_base_res_info(res_str_id: string) {
    return this.baseService
      .get(`/api/res/${res_str_id}/base`);
  }

  public get_res_info(res_str_id: string, data: {visit_key: string}) {
    return this.baseService
      .get(`/api/res/${res_str_id}`, data);
  }

  public create_folder(res_str_id: string, data: {folder_name: string}) {
    return this.baseService
      .post(`/api/res/${res_str_id}/folder`, data);
  }

  public create_link(res_str_id: string, data: {link_name: string, link: string}) {
    return this.baseService
      .post(`/api/res/${res_str_id}/link`, data);
  }

  public modify_res_info(res_str_id: string,
                         data: {
                           rname: string,
                           status: number,
                           description: string,
                           visit_key: string,
                           right_bubble: boolean,
                           parent_str_id: string
  }) {
    // const res_str_id = path[path.length - 1];
    return this.baseService
      .put(`/api/res/${res_str_id}`, data);
  }

  public delete_res(res_str_id: string, within?: string) {
    const scope = within ? `?within=${encodeURIComponent(within)}` : '';
    return this.baseService.del(`/api/res/${encodeURIComponent(res_str_id)}${scope}`);
  }

  public modify_res_cover(res_str_id: string, data: {cover: string, cover_type: number}) {
    return this.baseService
      .put(`/api/res/${res_str_id}/cover`, data);
  }
}
