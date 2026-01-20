import { randomUUID } from "crypto"
import { logger } from "./logger"

export const generateDid = () => {
    logger.warn("DID generation is not implemented")
    return randomUUID()
}