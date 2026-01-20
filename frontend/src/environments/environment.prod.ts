import { Config } from "../models/config";
import { getHostUrl } from "./metadata.service";

export const environment: Config = {
  serverHost: getHostUrl(),
}
