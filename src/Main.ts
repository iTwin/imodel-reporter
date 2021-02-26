/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ClientRequestContext } from "@bentley/bentleyjs-core";
import { IModelHost, DesktopAuthorizationClient, BriefcaseDb, BriefcaseManager, RequestNewBriefcaseArg, ProgressFunction } from "@bentley/imodeljs-backend";
import { DesktopAuthorizationClientConfiguration, IModelVersion } from "@bentley/imodeljs-common";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";
import { DataExporter } from "./DataExporter";

async function signIn(): Promise<AccessToken|undefined> {

  const config: DesktopAuthorizationClientConfiguration = {
    clientId: "imodeljs-electron-samples",
    redirectUri: "http://localhost:3000/signin-callback",
    scope: "openid email profile organization imodelhub context-registry-service:read-only product-settings-service projectwise-share urlps-third-party offline_access"
  };

  const client = new DesktopAuthorizationClient(config);
  const requestContext = new ClientRequestContext();
  await client.initialize(requestContext);

  return new Promise<AccessToken | undefined>((resolve) => {
    client.onUserStateChanged.addListener((token: AccessToken | undefined) => resolve(token));
    client.signIn(requestContext);
  });
}

export async function main(process: NodeJS.Process): Promise<void> {
  try {
    await IModelHost.startup();

    const accessToken: AccessToken | undefined = await signIn();
    if (!accessToken) {
      console.error("Failed to sign-in");
      return;
    }

    let userdata;
    const json = process.argv[2]
    if (json === undefined) {
        userdata = require("../queries/example.json");
    } else {
        userdata = require(json);
    }

    const url = new URL(userdata.url.toLowerCase());
    const projectId: string = url.searchParams.get("projectid") ?? '';
    const iModelId: string = url.searchParams.get("imodelid") ?? '';
    const changeSetId: string = url.searchParams.get("changesetid") ?? '';

    const version = changeSetId === '' ? IModelVersion.latest() : IModelVersion.asOfChangeSet(changeSetId);

    if (projectId === '' || iModelId === '') {
      console.error("Error in parsing url from query");
      return;
    }

    // If this function returns non-zero, the download is aborted.
    const progressTracking: ProgressFunction = (loaded: number, total: number):  number => {
      const percent = loaded/total*100;
      process.stdout.cursorTo(0);
      process.stdout.write(`Downloaded: ${percent.toFixed(2)} %`);

      return 0;
    }

    console.log(`Started opening iModel (projectId=${projectId}, iModelId=${iModelId}, changeSetId=${changeSetId})`);
    const requestContext: AuthorizedClientRequestContext = new AuthorizedClientRequestContext(accessToken);
    const requestNewBriefcaseArg: RequestNewBriefcaseArg = { contextId: projectId, iModelId: iModelId, asOf: version.toJSON(), briefcaseId: 0, onProgress: progressTracking };
    const briefcaseProps = await BriefcaseManager.downloadBriefcase(requestContext, requestNewBriefcaseArg);
    requestContext.enter();

    const iModelDb = await BriefcaseDb.open(requestContext, briefcaseProps);
    requestContext.enter()
    console.log("\nFinished opening iModel");

    const exporter = new DataExporter(iModelDb);
    exporter.setfolder(userdata.folder);
   
    for (const querykey of Object.keys(userdata.queries)) {
      const aQuery = userdata.queries[querykey];
      await exporter.writeQueryResultsToCsv(aQuery.query, querykey + ".csv", aQuery.options)
    }

    iModelDb.close();
  } catch (error) {
    console.error(error.message + "\n" + error.stack);
  }
  finally {
    await IModelHost.shutdown();
  }
}

// Invoke main if Main.js is being run directly
if (require.main === module) {
  main(process);
}