import { Routes } from '@angular/router';
import { Landing } from './features/landing/landing';
import { CallbackResolver } from './core/guards/callback-guard';
import { Submit } from './features/submit/submit';
import { AuthGuard } from './core/guards/auth-guard';
import { Dashboard } from './features/admin/dashboard/dashboard';

export const routes: Routes = [
    { path: '', component: Landing, pathMatch: 'full' },
    { path: 'submit', component: Submit, pathMatch: 'full' },
    { path: 'callback', resolve: {callback: CallbackResolver }, component: Landing},
    { path: 'admin', canActivate: [AuthGuard], component: Dashboard, pathMatch: 'full' },
    { path: '**', redirectTo: '' }
];
