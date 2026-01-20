import { inject } from '@angular/core';
import {
  HttpEvent, HttpRequest, HttpHandlerFn
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { NotificationService } from '../services/notification';

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const authService = inject(AuthService);
  const router = inject(Router);
  const notifier = inject(NotificationService);

  const token = authService.accessToken;
  let nextReq = req;
  if (token) {
    nextReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  }
  return next(nextReq).pipe(tap({
    error: (error) => {
      const errorOrigin = error.headers?.get('X-Error-Origin');
      if ((error.status === 401 || error.status === 403) && errorOrigin === 'marketplace') {
        authService.logout();
        notifier.info("Token expired. Login again")
        router.navigate(['/login']);
      }
    }
  }));
}
