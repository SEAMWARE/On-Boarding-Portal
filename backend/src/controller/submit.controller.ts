import { Router } from "express";
import { getFilesPath, removeFolder, saveFiles, uploadFiles } from "../middleware/storage.middleware";

import { logger } from '../service/logger';
import { requestRepository } from "../repository/request.repository";
import { isDuplicatedKeyError } from "../type/db-errors";
import { generateDid } from "../service/did.service";
import { sendEmail } from "../service/email.service";
const router = Router();

router.post('/submit', uploadFiles('files', { maxCount: 5, allowedTypes: /pdf/ }), async (req, res) => {
  let filePath;
  let { name, email, did } = req.body;
  try {
    logger.info(`Processing onboarding for: ${name}`);

    did = did || generateDid();
    const uploadedFiles = req.files as Express.Multer.File[];

    if (!name || !email) {
      return res.status(400).json({ error: 'Missing mandatory fields: name or email' });
    }

    logger.debug(`Files received: ${uploadedFiles ? uploadedFiles.length : 0}`);

    filePath = getFilesPath(did);
    const requestResult = await requestRepository.createRequest(email, did, filePath);

    if (uploadedFiles && uploadedFiles.length != 0) {
      filePath = await saveFiles(did, uploadedFiles)
    }

    res.status(201).json({
      requestId: requestResult.id,
      did: requestResult.did,
      timestamp: new Date().toISOString()
    });
    sendEmail(email);
  } catch (error) {
    logger.error('Submission Error:', error);
    if (filePath) {
      await removeFolder(filePath);
    }
    if (isDuplicatedKeyError(error)) {
      res.status(400).json({ error: `DID '${did}' or email '${email}' has been already submitted`})
      return
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;