import fs from 'fs/promises';
import path, { resolve } from 'path';
import { FileMetadata } from '../type/file-metadata';
import { configService } from './config.service';
import { writeFile, mkdir, rm, rename } from 'fs/promises';
import { logger } from './logger';

const storageConfig = configService.get().server.storage;
const filesRoot = path.join(process.cwd(), storageConfig.destFolder);

export class StorageService {

    async listFiles(directoryPath: string): Promise<FileMetadata[]> {
        try {
            await fs.access(directoryPath);

            const entries = await fs.readdir(directoryPath, { withFileTypes: true });

            const files = entries.filter(entry => entry.isFile() && !entry.name.startsWith('.'));

            return await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(directoryPath, file.name);
                    const stats = await fs.stat(filePath);

                    return {
                        name: file.name,
                        size: stats.size,
                        extension: path.extname(file.name).toLowerCase(),
                        createdAt: stats.birthtime
                    };
                })
            );
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw new Error(`Could not read directory: ${error.message}`);
        }
    }

    async getFilePath(directoryPath: string, fileName: string): Promise<string | null> {
        try {
            const fullPath = path.join(directoryPath, fileName);

            await fs.access(fullPath);
            const stats = await fs.stat(fullPath);

            if (!stats.isFile()) return null;

            return fullPath;
        } catch {
            return null;
        }
    }
    getFilesPath(did: string): string {
        return resolve(path.join(filesRoot, 'onboarding', did));
    }

    async saveFiles(did: string, files: Express.Multer.File[]): Promise<string> {
        const targetDir = this.getFilesPath(did);
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

    async updateFiles(prevDid: string, did: string, files?: Express.Multer.File[]): Promise<string> {

        const didFolder = this.getFilesPath(did);
        if (prevDid !== did) {
            await rename(this.getFilesPath(prevDid), didFolder)
        }
        if (files?.length) {
            await this.removeFolder(this.getFilesPath(prevDid))
            return await this.saveFiles(did, files);
        }
        return didFolder;
    }

    async removeFolder(folderPath: string): Promise<boolean> {
        try {

            const absolutePath = resolve(process.cwd(), folderPath);

            await rm(absolutePath, {
                recursive: true,
                force: true
            });

            logger.info(`Folder removed successfully: ${absolutePath}`);

        } catch (error) {
            logger.info(`Error while removing folder: ${folderPath}`, error);
        }
        return Promise.resolve(false)
    };
}

export const storageService = new StorageService();