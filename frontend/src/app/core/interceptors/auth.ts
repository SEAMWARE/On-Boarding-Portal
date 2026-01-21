import { inject } from '@angular/core';
import {
  HttpEvent, HttpRequest, HttpHandlerFn,
  HttpErrorResponse
} from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { NotificationService } from '../services/notification';

let isRefreshing = false;
const refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  const authService = inject(AuthService);
  const router = inject(Router);
  const notifier = inject(NotificationService);

  const token = authService.accessToken;
  let authReq = req;

  if (token) {
    authReq = addTokenHeader(req, token);
  }

  if (req.url.includes(authService.refreshPath)) {
    return next(authReq);
  }
  return next(authReq).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse) {
        if ((error.status === 401 || error.status === 403)) {
          return handleAuthError(req, next, authService, router, notifier);
        }
      }
      return throwError(() => error);
    })
  );
}


function handleAuthError(
  req: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
  notifier: NotificationService
): Observable<HttpEvent<any>> {

  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshToken().pipe(
      switchMap((response) => {
        isRefreshing = false;
        const newToken = response.access_token;
        refreshTokenSubject.next(newToken);

        return next(addTokenHeader(req, newToken));
      }),
      catchError((err) => {
        isRefreshing = false;
        authService.logout();
        notifier.info("Session expired. Please login again");
        router.navigate(['/login']);
        return throwError(() => err);
      })
    );
  } else {
    return refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap((token) => next(addTokenHeader(req, token!)))
    );
  }
}

function addTokenHeader(request: HttpRequest<any>, token: string) {
  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}
