import { Injectable } from '@angular/core';
import { ServerConfigService } from './server-config';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  token?: string;
  vc: any = {}

  get isLoggedIn(): boolean {
    return !!this.token && !this.isExpired
  }

  set accessToken(token: string | undefined) {
    this.token = token
    if (token) {
      try {
        this.vc = JSON.parse(atob(token.split(".")[1]))
      } catch(err) {
        console.error("Error decoding token", err);
        this.vc = {}
        this.token = undefined;
      }
    } else {
      this.vc = {}
    }
  }
  get accessToken(): string | undefined {
    return this.token
  }

  get isExpired(): boolean {
    if (!this.vc || !this.vc.exp) {
      return false
    }
    return (Date.now() / 1000) > this.vc.exp;
  }

  constructor(private readonly configSvc: ServerConfigService) {

    this.accessToken = localStorage.getItem("access_token") || undefined;
  }

  login() {
    window.location.href = "/api/login";
  }

  handleCallback(accessToken: string): boolean {
    try {
      window.localStorage.setItem("access_token", accessToken)
      this.accessToken = accessToken;
          return true;
    } catch(err) {
      console.error("Unable to set token", err);
      return false;
    }
  }

  getUser(): any | undefined {
    if (!this.token || this.isExpired) {
      return undefined
    }
    return this.vc;
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
    this.accessToken = undefined;
  }
}
