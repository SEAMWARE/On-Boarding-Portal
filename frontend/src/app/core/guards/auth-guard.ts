import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth';
import { catchError, map, Observable, of } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree> {
    if (this.auth.isLoggedIn) {
      return of(true);
    }
    if (!this.auth.refreshToken) {
      return this.router.navigate(['/'])
    }

    return this.auth.refreshToken().pipe(
      map((res) => true),
      catchError((error) => {
        console.log("Error refreshing token", error)
        return this.router.navigate(['/'])
      })
    )

  }
}