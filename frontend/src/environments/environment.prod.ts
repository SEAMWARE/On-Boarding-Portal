import { Config, DEFAULT_THEME } from "../models/config";
import { getHostUrl, getMetadata, getMetadataAsBoolean, getMetadataAsObject } from "./metadata.service";

export const environment: Config = {
  serverHost: getHostUrl(),
  documentToSignUrl: getMetadata('documentToSignUrl', '')!,
  didCreationEnabled: getMetadataAsBoolean('didCreationEnabled', false)!,
  theme: getMetadataAsObject('theme') ?? DEFAULT_THEME
}
