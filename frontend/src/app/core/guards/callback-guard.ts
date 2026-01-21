import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CallbackResolver implements Resolve<any> {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  resolve(route: ActivatedRouteSnapshot): Observable<any> | any {
    const accessToken = route.queryParamMap.get('access_token');
    const refreshToken = route.queryParamMap.get('refresh_token');

    if (accessToken) {
      const logged = this.auth.handleCallback(accessToken, refreshToken || '');
      if (logged) {
        this.router.navigate(['/admin']);
      } else {
        this.router.navigate(['/login']);
      }
      return of(null);
    }

    if (refreshToken) {
      return this.auth.refreshToken().pipe(
        map((res) => {
          this.router.navigate(['/admin']);
          return res;
        }),
        catchError(() => {
          this.router.navigate(['/login']);
          return of(null);
        })
      );
    }

    this.router.navigate(['/login']);
    return of(null);
  }
}