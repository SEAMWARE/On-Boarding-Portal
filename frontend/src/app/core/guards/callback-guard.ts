import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve, Router } from '@angular/router';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class CallbackResolver implements Resolve<any> {

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router) { }

  resolve(
    route: ActivatedRouteSnapshot
  ): any {

    const accessToken = route.queryParamMap.get('access_token')
    if (!accessToken) {
      this.router.navigate(['/login']);
      return null;
    }

    const logged = this.auth.handleCallback(accessToken);

    if (logged) {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/login']);
    }

    return null;
  }
}
