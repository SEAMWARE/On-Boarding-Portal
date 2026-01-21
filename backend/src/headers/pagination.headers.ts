import { Request } from "express";
import { PaginationQuery } from "../type/pagination-query";

export class PaginationHeader {

    static parsePagination(req: Request): PaginationQuery {

        const page = parseInt(req.query.page as string) || 0;
        const limit = parseInt(req.query.limit as string) || 10;
        const sortBy = req.query.sortBy as string || 'createdAt';
        const order = req.query.order === 'ASC' ? 'ASC' : 'DESC';

        return {
            page,
            limit,
            sortBy,
            order
        }
    }
}