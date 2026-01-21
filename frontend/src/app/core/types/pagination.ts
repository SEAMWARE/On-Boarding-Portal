import { Observable } from "rxjs";


export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy?: number;
  order?: 'DESC' | 'ASC';
}

export interface PaginatedResponse<T> {
  items: T[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export type PageQueryFn<T> = (page: number, limit: number, filter: { [key: string]: any }) => Observable<PaginatedResponse<T>>;