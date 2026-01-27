import { Router } from "express";
import { registrationRepository, RegistrationUpdate } from "../repository/registration.repository";
import { logger } from "../service/logger";
import { isDuplicatedKeyError } from "../type/db-errors";
import emailService from "../service/email.service";
import { RegistrationStatus } from "../entity/registration.entity";
import { storageService } from "../service/storage.service";
import { uploadFiles } from "../middleware/storage.middleware";

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
        emailService.sendSubmitEmail(data.email, registration.id).catch((error) => {
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
    const { email, did } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];
    if (!email || !did || !uploadFiles) {
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

        const data: RegistrationUpdate = {}
        if (email) {
            data.email = email
        }
        if (did) {
            data.did = did;
            data.filesPath = storageService.getFilesPath(did);
        }

        // This can cause error if update fails
        if (uploadedFiles?.length > 0 || did !== prevRegistration.did) {
            await storageService.updateFiles(prevRegistration.did, did, uploadedFiles)
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