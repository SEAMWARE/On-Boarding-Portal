export interface TrusterIssuer {
    did: string;
    credentials: IssuerCredentials[];
}

export interface IssuerCredentials {
    validFor?: {from: string, to: string};
    credentialsType: string;
    claims?: IssuerClaim[]
}

export interface IssuerClaim {
    name: string;
    path: string;
    allowedValues: any[];
}