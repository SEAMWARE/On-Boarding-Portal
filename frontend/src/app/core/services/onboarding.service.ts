import { HttpClient, HttpHeaders } from "@angular/common/http";
import { AuthService } from "./auth";
import { ServerConfigService } from "./server-config";
import { Observable } from "rxjs";
import { Injectable } from "@angular/core";

export interface RequestForm {
    email: string;
    name: string;
    did?: string;
}

@Injectable({
    providedIn: 'root',
})
export class OnBoardingService {

    baseUrl: string;
    submitPath = '/api/submit'
    constructor(
        private readonly http: HttpClient,
        private readonly authService: AuthService,
        config: ServerConfigService
    ) {
        this.baseUrl = config.getProperty('serverHost') || '';
        if (this.baseUrl.endsWith("/")) {
            this.baseUrl = this.baseUrl.slice(0, -1);
        }
    }

    submitRequest(formValues: RequestForm, files: File[]): Observable<any> {
        const url = this._resolveUrl(this.submitPath);

        const headers = this._getHeaders();

        const body = new FormData();

        body.append('name', formValues.name);
        body.append('email', formValues.email);

        if (formValues.did) {
            body.append('did', formValues.did);
        }

        files.forEach((file) => {
            body.append('files', file, file.name);
        });

        return this.http.post<any>(url, body, { headers });
    }

    _getHeaders(): HttpHeaders {

        const org = this.authService.getUser()?.verifiableCredential?.issuer!;
        return new HttpHeaders({
            'x-organization': org,
        });
    }

    _resolveUrl(path: string): string {

        if (path.startsWith("/")) {
            return this.baseUrl + path;
        }
        return `${this.baseUrl}/${path}`;
    }
}