import { Injectable } from '@angular/core';
import { ServerConfigService } from './server-config';
import { Observable, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  readonly refreshPath = "/api/login/refresh"

  baseUrl: string;
  token?: string;
  _refreshToken?: string;
  user: any = {}

  get isLoggedIn(): boolean {
    return !!this.token && !this.isExpired
  }

  set accessToken(token: string | undefined) {
    this.token = token
    if (token) {
      try {
        this.user = JSON.parse(atob(token.split(".")[1]))
      } catch (err) {
        console.error("Error decoding token", err);
        this.user = {}
        this.token = undefined;
      }
    } else {
      this.user = {}
    }
  }
  get accessToken(): string | undefined {
    return this.token
  }

  get isExpired(): boolean {
    if (!this.user || !this.user.exp) {
      return false
    }
    return (Date.now() / 1000) > this.user.exp;
  }

  constructor(
    config: ServerConfigService,
    private readonly http: HttpClient
  ) {
    this.accessToken = localStorage.getItem("access_token") || undefined;
    this._refreshToken = localStorage.getItem("refresh_token") || undefined;
    this.baseUrl = config.getProperty('serverHost') || '';

  }

  login() {
    window.location.href = "/api/login";
  }

  handleCallback(accessToken: string, refreshToken?: string): boolean {
    try {
      if (!accessToken) { return false;}
      window.localStorage.setItem("access_token", accessToken)
      if (refreshToken) {
        window.localStorage.setItem("refresh_token", refreshToken)
      }
      this.accessToken = accessToken;
      this.refreshToken = this.refreshToken;
      return true;
    } catch (err) {
      console.error("Unable to set token", err);
      return false;
    }
  }

  getUser(): any | undefined {
    if (!this.token || this.isExpired) {
      return undefined
    }
    return this.user;
  }

  hasRole(role: string): boolean {

    const user = this.getUser();
    if (!user) {
      return false;
    }
    // TODO review this
    const claims = user.verifiableCredential?.credentialSubject;
    if (!claims || !claims?.roles) {
      return false;
    }
    // TODO review it
    return true;
  }

  logout() {
    window.localStorage.removeItem('access_token');
    window.localStorage.removeItem('refresh_token');
    this.accessToken = undefined;
    this._refreshToken = undefined;
  }

  refreshToken(): Observable<any> {
    const url = this._resolveUrl(this.refreshPath);
    return this.http.post<any>(url, { refresh_token: this._refreshToken }).pipe(
      tap(res => {
        const { access_token, refresh_token } = res;
        this.handleCallback(access_token, refresh_token);
      })
    );
  }

  _resolveUrl(path: string): string {

    if (path.startsWith("/")) {
      return this.baseUrl + path;
    }
    return `${this.baseUrl}/${path}`;
  }
}
