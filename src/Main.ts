/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BriefcaseDb, BriefcaseManager, IModelDb, IModelHost, IModelHostConfiguration } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { BriefcaseIdValue, LocalBriefcaseProps } from "@itwin/core-common";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { NodeCliAuthorizationClient } from "@itwin/node-cli-authorization";

import { DataExporter } from "./DataExporter";

const AUTH_CLIENT_CONFIG_PROPS = {
  clientId: "imodeljs-electron-samples", // EDIT ME! Specify your own clientId
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

  Logger.initializeToConsole();
  Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Info);

  let userdata;
  const json = process.argv[2];
  if (json === undefined) {
    userdata = require("../queries/example.json");
  } else {
    userdata = require(json);
  }

  const url = new URL(userdata.url.toLowerCase());
  const iTwinId: string = url.searchParams.get("projectid") ?? "";
  const iModelId: string = url.searchParams.get("imodelid") ?? "";
  const changeSetId: string = url.searchParams.get("changesetid") ?? "";
  const iModelDb: IModelDb = await openIModelFromIModelHub(iTwinId, iModelId, changeSetId);

  Logger.logInfo(APP_LOGGER_CATEGORY, `iModel ${iModelDb.name} acquired and opened`);
  const exporter = new DataExporter(iModelDb);
  exporter.setFolder(userdata.folder);

  for (const querykey of Object.keys(userdata.queries)) {
    const aQuery = userdata.queries[querykey];
    const fileName = `${aQuery.store !== undefined ? aQuery.store : querykey}.csv`;
    await exporter.writeQueryResultsToCsv(aQuery.query, fileName, aQuery.options);
  }

  iModelDb.close();
})().catch((reason) => {
  process.stdout.write(`${reason}\n`);
  process.exit(1);
});

export async function openIModelFromIModelHub(iTwinId: string, iModelId: string, changeSetId: string): Promise<BriefcaseDb> {
  if (!AUTH_CLIENT_CONFIG_PROPS.clientId || !AUTH_CLIENT_CONFIG_PROPS.scope || !AUTH_CLIENT_CONFIG_PROPS.redirectUri)
    return Promise.reject("You must edit AUTH_CLIENT_CONFIG in Main.ts");

  const authorizationClient = new NodeCliAuthorizationClient({ ...AUTH_CLIENT_CONFIG_PROPS });
  Logger.logInfo(APP_LOGGER_CATEGORY, "Attempting to sign in");
  await authorizationClient.signIn();
  Logger.logInfo(APP_LOGGER_CATEGORY, "Sign in successful");
  IModelHost.authorizationClient = authorizationClient;

  let briefcaseProps: LocalBriefcaseProps | undefined = getBriefcaseFromCache(iModelId);
  if (!briefcaseProps)
    briefcaseProps = await downloadBriefcase(iTwinId, iModelId, changeSetId);

  const briefcaseResult = BriefcaseDb.open({ fileName: briefcaseProps.fileName, readonly: true });
  return briefcaseResult;
}

function getBriefcaseFromCache(iModelId: string): LocalBriefcaseProps | undefined {
  const cachedBriefcases: LocalBriefcaseProps[] = BriefcaseManager.getCachedBriefcases(iModelId);
  if (cachedBriefcases.length === 0) {
    Logger.logInfo(APP_LOGGER_CATEGORY, `No cached briefcase found for ${iModelId}`);
    return undefined;
  }

  // Just using any version that's cached. A real program would verify that this is the desired changeset.
  Logger.logInfo(APP_LOGGER_CATEGORY, `Using cached briefcase found at ${cachedBriefcases[0].fileName}`);
  return cachedBriefcases[0];
}

async function downloadBriefcase(iTwinId: string, iModelId: string, changeSetId: string): Promise<LocalBriefcaseProps> {
  Logger.logInfo(APP_LOGGER_CATEGORY, `Downloading new briefcase for iTwinId ${iTwinId} iModelId ${iModelId}`);

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

  return BriefcaseManager.downloadBriefcase({ ...{ iTwinId, iModelId, changeSetId }, onProgress, briefcaseId: BriefcaseIdValue.Unassigned });
}
