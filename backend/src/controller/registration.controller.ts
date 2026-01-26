import { Router } from "express";
import { registrationRepository } from "../repository/registration.repository";
import { getFilesPath, removeFolder, saveFiles, uploadFiles } from "../middleware/storage.middleware";
import { logger } from "../service/logger";
import { isDuplicatedKeyError } from "../type/db-errors";
import emailService from "../service/email.service";

const router = Router()

router.post('/registrations/submit', uploadFiles('files', { maxCount: 5, allowedTypes: /pdf/ }), async (req, res) => {
    let filesPath, registration;
    let { file, ...data } = req.body;
    try {
        logger.info(`Processing onboarding for: ${data.name}`);

        const uploadedFiles = req.files as Express.Multer.File[];

        logger.debug(`Files received: ${uploadedFiles ? uploadedFiles.length : 0}`);

        filesPath = getFilesPath(data.did);
        registration = await registrationRepository.save({ ...data, filesPath });

        if (uploadedFiles && uploadedFiles.length != 0) {
            filesPath = await saveFiles(data.did, uploadedFiles)
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
            await removeFolder(filesPath);
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

export default router;