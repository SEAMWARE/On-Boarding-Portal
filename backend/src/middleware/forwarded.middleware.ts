import { NextFunction, Request, Response } from "express";

export function forwardedMiddleware(req: Request, res: Response, next: NextFunction){
    let protocol = (req.headers['x-forwarded-proto'] || req.protocol) as string;

    let host = (req.headers['x-forwarded-host'] || req.headers['host']) as string;

    const forwarded = req.headers['forwarded'];
    if (forwarded) {
        const protoMatch = /proto=(https|http)/i.exec(forwarded);
        const hostMatch = /host=([^; ]+)/i.exec(forwarded);
        if (protoMatch) protocol = protoMatch[1];
        if (hostMatch) host = hostMatch[1];
    }

    const cleanHost = host?.split(',')[0].trim();
    const cleanProto = protocol?.split(',')[0].trim();

    (req as any).serverOrigin = `${cleanProto}://${cleanHost}`;
    next();
}