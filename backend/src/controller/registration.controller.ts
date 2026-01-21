import { Request, Response, Router } from "express";
import { RegistrationStatus } from "../entity/registration.entity";
import { In } from "typeorm";
import { registrationRepository } from "../repository/registration.repository";
import { PaginationHeader } from "../headers/pagination.headers";
import { oidcAuthMiddleware } from "../middleware/auth.middleware";

const router = Router()

router.get('/registration', oidcAuthMiddleware(), async (req: Request, res: Response) => {
    try {

        const {page, limit, sortBy, order} = PaginationHeader.parsePagination(req);
        const statusQuery = req.query.status as string;

        let where: any = {};

        if (statusQuery) {
            const statuses = statusQuery.split(',') as RegistrationStatus[];
            where.status = In(statuses);
        }

        const result = await registrationRepository.find({
            page,
            limit,
            where,
            order: { [sortBy]: order }
        });

        res.status(200).json(result);

    } catch (error) {
        console.error('Error fetching registrations:', error);
        res.status(500).json({
            message: 'Error retrieving registrations',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;