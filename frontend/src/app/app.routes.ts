import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { CallbackResolver } from './core/guards/callback-guard';

export const routes: Routes = [
    { path: 'login', component: Landing, pathMatch: 'full' },
    { path: 'callback', resolve: {callback: CallbackResolver }, component: Landing},
    { path: '**', redirectTo: 'login' }
];
