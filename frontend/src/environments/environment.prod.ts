import { Config } from "../models/config";
import { getHostUrl, getMetadata, getMetadataAsBoolean } from "./metadata.service";

export const environment: Config = {
  serverHost: getHostUrl(),
  documentToSignUrl: getMetadata('documentToSignUrl', '')!,
  didCreationEnabled: getMetadataAsBoolean('didCreationEnabled', false)!
}
