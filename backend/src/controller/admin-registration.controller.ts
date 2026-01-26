import { Request, Response, Router } from "express";
import { AdminRegistration, RegistrationStatus } from "../entity/registration.entity";
import { In } from "typeorm";
import { registrationRepository } from "../repository/registration.repository";
import { PaginationHeader } from "../headers/pagination.headers";
import { oidcAuthMiddleware } from "../middleware/auth.middleware";
import { storageService } from "../service/storage.service";
import emailService from "../service/email.service";
import { logger } from "../service/logger";
import { registrationService } from "../service/registration.service";

const router = Router()

const authFilter = oidcAuthMiddleware()
router.get('/admin/registrations', authFilter, async (req: Request, res: Response) => {
    try {

        const { page, limit, sortBy, order } = PaginationHeader.parsePagination(req);
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

        if (result.items) {
            const filePromises = result.items.map(async (reg) => {
                if (reg.filesPath) {
                    (reg as AdminRegistration).files = await storageService.listFiles(reg.filesPath);
                }
            });
            await Promise.all(filePromises);
        }
        res.status(200).json(result);

    } catch (error) {
        console.error('Error fetching registrations:', error);
        res.status(500).json({
            message: 'Error retrieving registrations',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.get('/admin/registrations/:id', authFilter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const registration = await registrationRepository.findById(id);
        if (!registration) {
            return res.status(404).json({
                message: `Registration with ID ${id} not found`
            });
        }

        const response: AdminRegistration = registration;
        if (registration?.filesPath) {
            response.files = await storageService.listFiles(registration.filesPath);
        }
        res.status(200).json(response);

    } catch (error) {
        console.error('Error fetching registration:', error);
        res.status(500).json({
            message: 'Error retrieving the registration record',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

router.put('/admin/registrations/:id', authFilter, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, reason } = req.body;
    const queryRunner = registrationRepository.transaction();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const prevRegistration = await registrationRepository.findById(id, queryRunner);
        if (!prevRegistration) {
            return res.status(404).json({
                message: `Registration with ID ${id} not found`
            });
        }
        const registration = (await registrationRepository.updateStatus(id as string, status, reason, queryRunner))!;
        const response: AdminRegistration = registration!;

        if (registration?.filesPath) {
            response.files = await storageService.listFiles(registration.filesPath);
        }

        // Update realm and TIR
        if (prevRegistration.status !== RegistrationStatus.ACTIVE && status === RegistrationStatus.ACTIVE) {
            await registrationService.register(registration.did);
        } else if(prevRegistration.status === RegistrationStatus.ACTIVE && status !== RegistrationStatus.ACTIVE) {
            await registrationService.unregister(registration.did);
        }

        queryRunner.commitTransaction();
        res.status(200).json(response);
        // TODO should send email first?
        const data = {
            requestId: registration.id,
            status: registration.status
        }
        await emailService.sendUpdateEmail(registration.email, data).catch((error) => {
            logger.warn('Unable to send update email.', error)
        })
    } catch(error) {
        logger.error('Unable to update status.', error);
        await queryRunner.rollbackTransaction() ;
    } finally {
        await queryRunner.release();
    }
})
router.get('/admin/registrations/:id/files', authFilter, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const registration = await registrationRepository.findById(id);

        if (!registration) {
            return res.status(404).json({ message: 'Registration not found' });
        }

        if (!registration.filesPath) {
            return res.status(200).json([]);
        }

        const files = await storageService.listFiles(registration.filesPath);

        res.status(200).json(files);

    } catch (error) {
        console.error('Error in getFiles endpoint:', error);
        res.status(500).json({ message: 'Error listing files' });
    }
});

router.get('/admin/registrations/:id/files/:filename', authFilter, async (req: Request, res: Response) => {
    try {
        const { id, filename } = req.params;

        const registration = await registrationRepository.findById(id);
        if (!registration || !registration.filesPath) {
            return res.status(404).json({ message: 'Registration or file path not found' });
        }

        const absolutePath = await storageService.getFilePath(registration.filesPath, filename as string);

        if (!absolutePath) {
            return res.status(404).json({ message: 'File not found on disk' });
        }
        res.sendFile(absolutePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error downloading file');
                }
            }
        });

    } catch (error) {
        console.error('Error in download endpoint:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;