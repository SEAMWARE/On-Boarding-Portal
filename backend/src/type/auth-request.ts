import { Request } from "express";
import { JWTPayload } from "jose";

export interface AuthRequest extends Request {
    user?: JWTPayload;
}