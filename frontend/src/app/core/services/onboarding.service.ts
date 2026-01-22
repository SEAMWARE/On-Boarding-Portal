import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { ServerConfigService } from "./server-config";
import { Observable } from "rxjs";
import { Injectable } from "@angular/core";
import { PaginatedResponse, PaginationQuery } from "../types/pagination";
import { Registration } from "../types/registration";
import { RegistrationStatus } from "../types/registration-status";

export interface RegistrationForm {
    email: string;
    name: string;
    did?: string;
}

@Injectable({
    providedIn: 'root',
})
export class OnBoardingService {

    baseUrl: string;
    submitPath = '/api/registrations/submit'
    registrations = '/api/admin/registrations'

    constructor(
        private readonly http: HttpClient,
        config: ServerConfigService
    ) {
        this.baseUrl = config.getProperty('serverHost') || '';
        if (this.baseUrl.endsWith("/")) {
            this.baseUrl = this.baseUrl.slice(0, -1);
        }
    }

    submitRegistration(formValues: RegistrationForm, files: File[]): Observable<any> {
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

    getRegistration(id: string): Observable<any> {
        const url = this._resolveUrl(`${this.submitPath}/${id}`);

        const headers = this._getHeaders();

        return this.http.get<any>(url, { headers });
    }

    getAdminRegistrations(
        pagination: PaginationQuery & { status?: string | string[] } = { page: 0, limit: 10 }
    ): Observable<PaginatedResponse<Registration>> {

        const url = this._resolveUrl(this.registrations);

        let params = new HttpParams()
            .set('page', pagination.page.toString())
            .set('limit', pagination.limit.toString())
            .set('sortBy', 'createdAt')
            .set('order', 'DESC');

        if (pagination.status) {
            const statusValue = Array.isArray(pagination.status)
                ? pagination.status.join(',')
                : pagination.status;

            params = params.set('status', statusValue);
        }

        return this.http.get<PaginatedResponse<Registration>>(url, { params });
    }
    getAdminRegistration(id: string) {
        const url = this._resolveUrl(`${this.registrations}/${id}`);

        return this.http.get<Registration>(url);
    }

    getAdminFile(id: string, filename: string): Observable<Blob> {

        const url = this._resolveUrl(`${this.registrations}/${id}/files/${filename}`)

        return this.http.get(url,{ responseType: 'blob' })
    }

    updateAdminRegistration(id: string, data: {status: RegistrationStatus, reason: string}): Observable<Registration> {

        data.status = data.status || '';
        const url = this._resolveUrl(`${this.registrations}/${id}`)
        return this.http.put<Registration>(url, data);
    }

    _getHeaders(): HttpHeaders {

        return new HttpHeaders();
    }

    _resolveUrl(path: string): string {

        if (path.startsWith("/")) {
            return this.baseUrl + path;
        }
        return `${this.baseUrl}/${path}`;
    }
}