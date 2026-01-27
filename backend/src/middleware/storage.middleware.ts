import { Request } from 'express';
import multer, { Options } from 'multer';
import path from 'path';
import { configService } from '../service/config.service';

const storageConfig = configService.get().server.storage;
// TODO refactor
const storage = multer.memoryStorage();

interface UploadOptions {
  maxCount?: number;
  allowedTypes?: RegExp;
  maxSizeMB?: number;
}

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
