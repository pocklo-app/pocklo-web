import { NgModule} from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { WorkspaceComponent } from "./components/workspace/workspace.component";
import { ResHomeComponent } from "./components/res/res-home.component";
import { LoginComponent } from "./components/user/login.component";
import { FriendenAccountComponent } from "./components/user/frienden-account.component";
import { OauthComponent } from "./components/user/oauth.component";
import { RefreshComponent } from "./components/user/refresh.component";
import { HomeComponent } from "./components/base/home.component";
import { CliComponent } from "./components/base/cli.component";

const routes: Routes = [
  { path: '', component: HomeComponent},
  { path: 'cli', component: CliComponent},
  { path: 'user/refresh', component: RefreshComponent},
  { path: 'res', component: ResHomeComponent},
  { path: 'res/next/:next', component: ResHomeComponent},
  { path: 'res/:res_str_id', component: WorkspaceComponent},
  { path: 'res/:res_str_id/:tab', component: WorkspaceComponent},
  { path: 'share/:token', component: WorkspaceComponent},
  { path: 'login', component: LoginComponent },
  { path: 'account', component: FriendenAccountComponent },
  { path: 'oauth/frienden/callback', component: FriendenAccountComponent, data: { friendenCallback: true } },
  { path: 'oauth/qtb/callback', component: OauthComponent},
  { path: '**', component: HomeComponent},
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
