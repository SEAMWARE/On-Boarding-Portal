import fs from 'fs/promises';
import path from 'path';
import { FileMetadata } from '../type/fille-metadata';

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
}

export const storageService = new StorageService();