import { Router } from "express";
import { registrationRepository, RegistrationUpdate } from "../repository/registration.repository";
import { logger } from "../service/logger";
import { isDuplicatedKeyError } from "../type/db-errors";
import emailService from "../service/email.service";
import { RegistrationStatus } from "../entity/registration.entity";
import { storageService } from "../service/storage.service";
import { uploadFiles } from "../middleware/storage.middleware";
import { MailContext } from "../type/main-context";

const router = Router()

router.post('/registrations/submit', uploadFiles('files', { maxCount: 5, allowedTypes: /pdf/ }), async (req, res) => {
    let filesPath, registration;
    let { file, ...data } = req.body;
    try {
        logger.info(`Processing onboarding for: ${data.name}`);

        const uploadedFiles = req.files as Express.Multer.File[];

        logger.debug(`Files received: ${uploadedFiles ? uploadedFiles.length : 0}`);

        filesPath = storageService.getFilesPath(data.did);
        registration = await registrationRepository.save({ ...data, filesPath });

        if (uploadedFiles && uploadedFiles.length != 0) {
            filesPath = await storageService.saveFiles(data.did, uploadedFiles)
        }

        res.status(201).json({
            id: registration.id,
            did: registration.did,
            timestamp: new Date().toISOString()
        });
        // TODO should send mail first?
        const mailContext: MailContext = {
            registration,
            serverOrigin: (req as any).serverOrigin
        }
        emailService.sendSubmitEmail(data.email, mailContext).catch((error) => {
            logger.warn('Unable to submit send email', error);
        })
    } catch (error) {
        logger.error('Submission Error:', error);
        if (filesPath) {
            await storageService.removeFolder(filesPath);
        }
        if (isDuplicatedKeyError(error)) {
            res.status(400).json({ error: `DID '${data.did}' or email '${data.email}' has been already submitted` })
            return
        }
        res.status(500).json({ error: 'Internal Server Error' });
        if (registration) {
            await registrationRepository.delete(registration.id)
        }
    }
});

router.get('/registrations/submit/:id', async (req, res) => {

    const id = req.params.id;

    try {
        const registration = await registrationRepository.findById(id);
        if (!registration) {
            res.status(404).json({
                message: `Registration '${id}' does not found`
            });
            return
        }
        const { filesPath, ...response } = registration;
        res.json(response);
    } catch (error) {
        logger.error(`Error getting registration '${id}'`, error)
        res.status(404).json({ message: `Registration '${id}' does not found` });
    }

})
router.put('/registrations/submit/:id',uploadFiles('files', { maxCount: 5, allowedTypes: /pdf/ }), async (req, res) => {
    const id = req.params.id as string;
    const data = req.body as RegistrationUpdate;
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!data || !uploadFiles) {
        return res.status(400).send({error: 'Email, DID or file field is required'})
    }
    const allowedStatus = [RegistrationStatus.ACTION_REQUIRED, RegistrationStatus.SUBMITTED]
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
        if (!allowedStatus.includes(prevRegistration?.status)) {
            return res.status(404).json({
                message: `Registration with ID ${id} cannot be updated in the current state`
            });
        }

        if (data.did) {
            data.filesPath = storageService.getFilesPath(data.did);
        } else {
            delete data.filesPath;
        }

        // This can cause error if update fails
        if (uploadedFiles?.length > 0 || data.did !== prevRegistration.did) {
            await storageService.updateFiles(prevRegistration.did, data.did || prevRegistration.did, uploadedFiles)
        }

        const registration = (await registrationRepository.updateInfo(id, data, queryRunner))!;

        await queryRunner.commitTransaction();
        res.status(200).json(registration);
    } catch(error) {
        logger.error('Unable to update registration', error);
        await queryRunner.rollbackTransaction();
        res.status(500).send({error: 'Error updating registration'});
    } finally {
        await queryRunner.release()
    }

})
export default router;