/*---------------------------------------------------------------------------------------------
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BackendIModelsAccess } from "@itwin/imodels-access-backend/lib/BackendIModelsAccess";
import { NodeCliAuthorizationClient } from "@itwin/node-cli-authorization";
import { DataExporter } from "./DataExporter";
import { BriefcaseManager, RequestNewBriefcaseArg } from "@itwin/core-backend/lib/cjs/BriefcaseManager";
import { IModelDb, BriefcaseDb } from "@itwin/core-backend/lib/cjs/IModelDb";
import { IModelHostConfiguration, IModelHost } from "@itwin/core-backend/lib/cjs/IModelHost";
import { Logger, LogLevel } from "@itwin/core-bentley/lib/cjs/Logger";
import { LocalBriefcaseProps, BriefcaseIdValue } from "@itwin/core-common/lib/cjs/BriefcaseTypes";
import { IModelVersion } from "@itwin/core-common";
import { ProgressFunction } from "@itwin/core-backend";
import { Readline } from "readline/promises";

// Find your iTwin and iModel IDs at https://developer.bentley.com/my-imodels/
const IMODELHUB_REQUEST_PROPS = {
  iTwinId: "e1af3a89-b637-4cea-91a9-1f38789eee33", // EDIT ME! Specify your own iTwinId
  iModelId: "ea48f654-987e-44b3-bdb6-5aeb36d15f33", // EDIT ME! Specify your own iModelId
};

const AUTH_CLIENT_CONFIG_PROPS = {
  clientId: "native-uBy8v6uCZ8QZfcFn1CecLrnBD", // EDIT ME! Specify your own clientId
  /** These are the minimum scopes needed - you can leave alone or replace with your own entries */
  scope: "imodels:read",
  /** This can be left as-is assuming you've followed the instructions in README.md when registering your application */
  redirectUri: "http://localhost:3000/signin-callback",
};

const APP_LOGGER_CATEGORY = "imodel-report-main";

(async () => {
  const imhConfig: IModelHostConfiguration = {
    hubAccess: new BackendIModelsAccess(), // needed to download iModels from iModelHub
    // These tile properties are unused by this application, but are required fields of IModelHostConfiguration.
    logTileLoadTimeThreshold: IModelHostConfiguration.defaultLogTileLoadTimeThreshold,
    logTileSizeThreshold: IModelHostConfiguration.defaultLogTileSizeThreshold,
    tileContentRequestTimeout: IModelHostConfiguration.defaultTileRequestTimeout,
    tileTreeRequestTimeout: IModelHostConfiguration.defaultTileRequestTimeout,
  };
  await IModelHost.startup(imhConfig);

  // await deletePassword(`Bentley.iTwinJs.OidcTokenStore.${AUTH_CLIENT_CONFIG_PROPS.clientId}`, "Glen.Worrall");

  Logger.initializeToConsole();
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Info);

  let userdata;
  const json = process.argv[2];
  if (json === undefined) {
    userdata = require("../queries/ifc.json");
  } else {
    userdata = require(json);
  }


  const url = new URL(userdata.url.toLowerCase());
  const iTwinId: string = url.searchParams.get("projectid") ?? "";
  const iModelId: string = url.searchParams.get("imodelid") ?? "";
  const changeSetId: string = url.searchParams.get("changesetid") ?? "";
  IMODELHUB_REQUEST_PROPS.iModelId = iModelId;
  IMODELHUB_REQUEST_PROPS.iTwinId = iTwinId;
  const version = changeSetId === "" ? IModelVersion.latest() : IModelVersion.asOfChangeSet(changeSetId);
  const iModelDb: IModelDb = await openIModelFromIModelHub();

  Logger.logInfo(APP_LOGGER_CATEGORY, `iModel ${iModelDb.name} acquired and opened`);
  const exporter = new DataExporter(iModelDb);
  exporter.setFolder(userdata.folder);

  for (const querykey of Object.keys(userdata.queries)) {
    const aQuery = userdata.queries[querykey];
    const fileName = `${aQuery.store !== undefined ? aQuery.store : querykey}.csv`;
    await exporter.writeQueryResultsToCsv(aQuery.query, fileName, aQuery.options, userdata.geometryCalculationSkipList);
  }

  iModelDb.close();
})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});

export async function openIModelFromIModelHub(): Promise<BriefcaseDb> {
  if (!AUTH_CLIENT_CONFIG_PROPS.clientId || !AUTH_CLIENT_CONFIG_PROPS.scope || !AUTH_CLIENT_CONFIG_PROPS.redirectUri)
    return Promise.reject("You must edit AUTH_CLIENT_CONFIG in Main.ts");

  const authorizationClient = new NodeCliAuthorizationClient({ ...AUTH_CLIENT_CONFIG_PROPS });
  Logger.logInfo(APP_LOGGER_CATEGORY, "Attempting to sign in");
  await authorizationClient.signIn();
  Logger.logInfo(APP_LOGGER_CATEGORY, "Sign in successful");
  IModelHost.authorizationClient = authorizationClient;

  if (!IMODELHUB_REQUEST_PROPS.iTwinId || !IMODELHUB_REQUEST_PROPS.iModelId)
    return Promise.reject("You must edit IMODELHUB_REQUEST_PROPS in Main.ts");

  let briefcaseProps: LocalBriefcaseProps | undefined = getBriefcaseFromCache();
  if (!briefcaseProps)
    briefcaseProps = await downloadBriefcase();

  const briefcaseResult = BriefcaseDb.open({ fileName: briefcaseProps.fileName, readonly: true });
  return briefcaseResult;
}

function getBriefcaseFromCache(): LocalBriefcaseProps | undefined {
  const cachedBriefcases: LocalBriefcaseProps[] = BriefcaseManager.getCachedBriefcases(IMODELHUB_REQUEST_PROPS.iModelId);
  if (cachedBriefcases.length === 0) {
    Logger.logInfo(APP_LOGGER_CATEGORY, `No cached briefcase found for ${IMODELHUB_REQUEST_PROPS.iModelId}`);
    return undefined;
  }

  // Just using any version that's cached. A real program would verify that this is the desired changeset.
  Logger.logInfo(APP_LOGGER_CATEGORY, `Using cached briefcase found at ${cachedBriefcases[0].fileName}`);
  return cachedBriefcases[0];
}

async function downloadBriefcase(): Promise<LocalBriefcaseProps> {
  Logger.logInfo(APP_LOGGER_CATEGORY, `Downloading new briefcase for iTwinId ${IMODELHUB_REQUEST_PROPS.iTwinId} iModelId ${IMODELHUB_REQUEST_PROPS.iModelId}`);

  let nextProgressUpdate = new Date().getTime() + 2000; // too spammy without some throttling
  const onProgress = (loadedBytes: number, totalBytes: number): number => {
    if (new Date().getTime() > nextProgressUpdate) {
      if (loadedBytes === totalBytes)
        Logger.logInfo(APP_LOGGER_CATEGORY, `Download complete, applying changesets`);
      else
        Logger.logInfo(APP_LOGGER_CATEGORY, `Downloaded ${(loadedBytes / (1024 * 1024)).toFixed(2)}MB of ${(totalBytes / (1024 * 1024)).toFixed(2)}MB`);
      nextProgressUpdate = new Date().getTime() + 2000;
    }
    return 0;
  };

  return BriefcaseManager.downloadBriefcase({ ...IMODELHUB_REQUEST_PROPS, onProgress, briefcaseId: BriefcaseIdValue.Unassigned});
}
