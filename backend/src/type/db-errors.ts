import { QueryFailedError } from "typeorm";

export enum PostgresErrorCode {
  UNIQUE_VIOLATION = '23505',
  FOREIGN_KEY_VIOLATION = '23503',
  NOT_NULL_VIOLATION = '23502',
}

export enum MySqlErrorCode {
  DUPLICATE_ENTRY = 1062,
  ROW_IS_REFERENCED = 1451,
}

export const isDuplicatedKeyError = (error: any) => {
    if (!(error instanceof QueryFailedError)) {
        return false;
    }
    const code = (error.driverError as any).code;
    switch (code) {
        case PostgresErrorCode.UNIQUE_VIOLATION:
        case MySqlErrorCode.DUPLICATE_ENTRY:
            return true;
        default:
            return false;
    }
}