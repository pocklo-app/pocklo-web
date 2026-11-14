import { SongEditorComponent, SongPlayerComponent } from './components/shared/song.component';
import { ResourcePickerComponent } from './components/picker/resource-picker.component';
import { BrowserModule } from '@angular/platform-browser';
import { HAMMER_GESTURE_CONFIG, HammerGestureConfig } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from "@angular/common/http";

import { DeveloperComponent } from "./components/developer/developer.component";
import { AppComponent } from './app.component';

import { AppRoutingModule } from "./app-routing.module";
import { PdfPreviewComponent } from "./components/shared/pdf-preview.component";
import { WorkspaceDesktopComponent } from "./components/workspace/workspace-desktop.component";
import { WorkspaceComponent } from "./components/workspace/workspace.component";
import { ResHomeComponent } from "./components/res/res-home.component";

import { UserService } from "./services/user.service";
import { BaseService } from "./services/base.service";
import { ClockService } from "./services/clock.service";
import { ResourceService } from "./services/resource.service";
import { LoadingComponent } from "./components/base/loading.component";
import { InfoComponent } from "./components/base/info.component";
import { JumpingComponent } from "./components/base/jumping.component";
import { FriendenAccountComponent } from "./components/user/frienden-account.component";
import { OauthComponent } from "./components/user/oauth.component";
import { RefreshComponent } from "./components/user/refresh.component";
import { TipsService } from "./services/tips.service";
import { UpdateService } from "./services/update.service";
import { ResTreeComponent } from "./components/res/res-tree.component";
import { ResourceTreeService } from "./services/resource-tree.service";
import { HomeComponent } from "./components/base/home.component";
import { CliComponent } from "./components/base/cli.component";
import { WechatShareService } from "./services/wechat-share.service";
import { ClipboardCopyDirective } from "./components/shared/clipboard-copy.directive";
import { MarkdownComponent } from "./components/shared/markdown.component";

// export class MyHammerConfig extends HammerGestureConfig  {
//   overrides = <any>{
//     'swipe': {velocity: 0.4, threshold: 20} // override default settings
//   };
// }

@NgModule({
  declarations: [
    AppComponent,
    DeveloperComponent,
    HomeComponent,
    CliComponent,
    WorkspaceComponent,
    SongEditorComponent, SongPlayerComponent,
    ResourcePickerComponent,
    WorkspaceDesktopComponent,
    PdfPreviewComponent,
    ResHomeComponent,
    LoadingComponent,
    JumpingComponent,
    InfoComponent,
    OauthComponent,
    FriendenAccountComponent,
    RefreshComponent,
    ResTreeComponent,
    ClipboardCopyDirective,
    MarkdownComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
  ],
  providers: [
    UserService,
    BaseService,
    ClockService,
    ResourceService,
    TipsService,
    UpdateService,
    ResourceTreeService,
    WechatShareService,
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: HammerGestureConfig
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
