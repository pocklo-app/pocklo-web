import { ResourcePickerComponent } from './components/picker/resource-picker.component';
import { NgModule, inject} from "@angular/core";
import { Router, RouterModule, Routes, UrlMatcher } from "@angular/router";
import { WorkspaceDesktopComponent } from "./components/workspace/workspace-desktop.component";
import { ResHomeComponent } from "./components/res/res-home.component";
import { FriendenAccountComponent } from "./components/user/frienden-account.component";
import { OauthComponent } from "./components/user/oauth.component";
import { RefreshComponent } from "./components/user/refresh.component";
import { HomeComponent } from "./components/base/home.component";
import { CliComponent } from "./components/base/cli.component";

import { DeveloperComponent } from "./components/developer/developer.component";

// Keep the same Finder desktop mounted as its main window changes directories.
const ownedWorkspace: UrlMatcher = segments => {
  if (segments[0]?.path !== 'res' || segments.length > 3) return null;
  return segments[1]
    ? { consumed: segments, posParams: { res_str_id: segments[1] } }
    : { consumed: segments };
};

const routes: Routes = [
  { path: '', component: HomeComponent},
  { path: 'cli', component: CliComponent},
  { path: 'user/refresh', component: RefreshComponent},
  { path: 'res/next/:next', component: ResHomeComponent},
  { matcher: ownedWorkspace, component: WorkspaceDesktopComponent},
  { path: 'picker/select', component: ResourcePickerComponent },
  { path: 'picker/embed', component: ResourcePickerComponent, data: { pickerEmbedded: true } },
  { path: 'share/:token', component: WorkspaceDesktopComponent},
  {
    path: 'login', component: HomeComponent,
    canActivate: [route => inject(Router).createUrlTree(['/'], { queryParams: route.queryParams })],
  },
  { path: 'account', component: FriendenAccountComponent },
  { path: 'oauth/frienden/callback', component: FriendenAccountComponent, data: { friendenCallback: true } },
  { path: 'oauth/qtb/callback', component: OauthComponent},
  { path: 'developer', component: DeveloperComponent, data: { mode: 'applications' } },
  { path: 'developer/admin', component: DeveloperComponent, data: { mode: 'admin' } },
  { path: 'developer/docs', component: DeveloperComponent, data: { mode: 'docs' } },
  { path: 'account/applications', component: DeveloperComponent, data: { mode: 'grants' } },
  { path: 'oauth/authorize', component: DeveloperComponent, data: { mode: 'consent' } },
  { path: 'oauth/authorize/:id', component: DeveloperComponent, data: { mode: 'consent' } },
  { path: '**', component: HomeComponent},
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
