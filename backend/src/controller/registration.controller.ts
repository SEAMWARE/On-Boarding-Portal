import { Router } from "express";
import { registrationRepository } from "../repository/registration.repository";
import { sendEmail } from "../service/email.service";
import { getFilesPath, removeFolder, saveFiles, uploadFiles } from "../middleware/storage.middleware";
import { logger } from "../service/logger";
import { isDuplicatedKeyError } from "../type/db-errors";
import { generateDid } from "../service/did.service";

const router = Router()

router.post('/registrations/submit', uploadFiles('files', { maxCount: 5, allowedTypes: /pdf/ }), async (req, res) => {
    let filesPath;
    let { name, email, did } = req.body;
    try {
        logger.info(`Processing onboarding for: ${name}`);

        did = did || generateDid();
        const uploadedFiles = req.files as Express.Multer.File[];

        if (!name || !email) {
            return res.status(400).json({ error: 'Missing mandatory fields: name or email' });
        }

        logger.debug(`Files received: ${uploadedFiles ? uploadedFiles.length : 0}`);

        filesPath = getFilesPath(did);
        const registration = await registrationRepository.save({ email, did, filesPath });

        if (uploadedFiles && uploadedFiles.length != 0) {
            filesPath = await saveFiles(did, uploadedFiles)
        }

        res.status(201).json({
            id: registration.id,
            did: registration.did,
            timestamp: new Date().toISOString()
        });
        sendEmail(email);
    } catch (error) {
        logger.error('Submission Error:', error);
        if (filesPath) {
            await removeFolder(filesPath);
        }
        if (isDuplicatedKeyError(error)) {
            res.status(400).json({ error: `DID '${did}' or email '${email}' has been already submitted` })
            return
        }
        res.status(500).json({ error: 'Internal Server Error' });
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
        res.status(500).json({ error: 'Internal Server Error' });
    }

})

export default router;