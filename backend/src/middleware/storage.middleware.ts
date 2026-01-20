import { Request } from 'express';
import multer, { Options } from 'multer';
import path, { resolve } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { configService } from '../service/config.service';
import { logger } from '../service/logger';

const storageConfig = configService.get().server.storage;
const filesRoot = path.join(process.cwd(), storageConfig.destFolder);
// TODO refactor
const storage = multer.memoryStorage();

/**
 * Configuration interface for the dynamic upload middleware
 */
interface UploadOptions {
  maxCount?: number;      // Maximum number of files
  allowedTypes?: RegExp;  // Regex for mimetypes and extensions
  maxSizeMB?: number;     // Max size in Megabytes
}

/**
 * Higher-order function that returns a configured Multer middleware.
 * @param fieldName The name of the form field containing the files
 * @param options Custom constraints for the upload
 */
export const uploadFiles = (
  fieldName: string,
  options: UploadOptions = {}
) => {
  const {
    maxCount = 1,
    allowedTypes = /jpeg|jpg|png|pdf/,
    maxSizeMB = 5
  } = options;

  const multerOptions: Options = {
    storage,
    limits: {
      fileSize: Math.min(maxSizeMB, storageConfig.maxSizeMB) * 1024 * 1024
    },
    fileFilter: (_: Request, file: Express.Multer.File, cb: any) => {
      const isMimeValid = allowedTypes.test(file.mimetype);
      const isExtValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());

      if (isMimeValid && isExtValid) {
        return cb(null, true);
      }
      cb(new Error(`File type not supported. Allowed patterns: ${allowedTypes}`));
    }
  };

  const upload = multer(multerOptions);

  return maxCount > 1
    ? upload.array(fieldName, maxCount)
    : upload.single(fieldName);
};
export const getFilesPath = (did: string): string => {
  return resolve(path.join(filesRoot, 'onboarding', did));
}

export const saveFiles = async (did: string, files: Express.Multer.File[]): Promise<string> => {
    const targetDir = getFilesPath(did);
    await mkdir(targetDir, { recursive: true });
    logger.info(`Saving files on ${targetDir}`)
    const paths: string[] = [];

    for (const file of files) {
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = path.join(targetDir, fileName);
      await writeFile(filePath, file.buffer);
      paths.push(filePath);
    }

    return targetDir;
}

export const removeFolder = async (folderPath: string): Promise<boolean> => {
  try {

    const absolutePath = resolve(process.cwd(), folderPath);

    await rm(absolutePath, {
      recursive: true,
      force: true
    });

    logger.info(`Folder removed successfully: ${absolutePath}`);

  } catch (error) {
    console.info(`Error while removing folder: ${folderPath}`, error);
  }
  return Promise.resolve(false)
};