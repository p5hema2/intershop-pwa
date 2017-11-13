import { Location } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { HomePageModule } from './pages/home-page/home-page.module';
import { LocalizeRouterLoader } from './services/router-parser-loader';
import { LocalizeRouterSettings } from './services/routes-parser-locale-currency/localize-router.config';
import { LocalizeRouterModule } from './services/routes-parser-locale-currency/localize-router.module';
import { LocalizeParser } from './services/routes-parser-locale-currency/localize-router.parser';

export function HttpLoaderFactory(translate: TranslateService, location: Location, settings: LocalizeRouterSettings) {
  return new LocalizeRouterLoader(translate, location, settings);
}

const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' }
];

@NgModule({
  imports: [
    HomePageModule,
    RouterModule.forRoot(routes),
    LocalizeRouterModule.forRoot(routes, {
      parser: {
        provide: LocalizeParser,
        useFactory: HttpLoaderFactory,
        deps: [TranslateService, Location, LocalizeRouterSettings]
      },
    }),
  ],
  exports: [RouterModule, LocalizeRouterModule]
})

export class AppRoutingModule {

}

