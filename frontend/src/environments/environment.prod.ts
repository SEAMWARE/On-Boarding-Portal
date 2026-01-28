import { Config } from "../models/config";
import { getHostUrl, getMetadata } from "./metadata.service";

export const environment: Config = {
  serverHost: getHostUrl(),
  documentToSignUrl: getMetadata('documentToSignUrl', '')!
}
