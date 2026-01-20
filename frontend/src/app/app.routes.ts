import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { CallbackResolver } from './core/guards/callback-guard';
import { Submit } from './features/submit/submit';

export const routes: Routes = [
    { path: 'login', component: Landing, pathMatch: 'full' },
    { path: 'submit', component: Submit, pathMatch: 'full' },
    { path: 'callback', resolve: {callback: CallbackResolver }, component: Landing},
    { path: '**', redirectTo: 'login' }
];
