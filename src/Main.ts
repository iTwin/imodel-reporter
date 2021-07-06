/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BentleyError } from "@bentley/bentleyjs-core";
import { ElectronAuthorizationBackend } from "@bentley/electron-manager/lib/ElectronBackend";
import {
  BriefcaseDb, BriefcaseManager, IModelHost, NativeHost, ProgressFunction, RequestNewBriefcaseArg,
} from "@bentley/imodeljs-backend";
import { IModelVersion, NativeAppAuthorizationConfiguration } from "@bentley/imodeljs-common";
import { AccessToken, AuthorizedClientRequestContext } from "@bentley/itwin-client";

import { DataExporter } from "./DataExporter";

import readline = require("readline");

async function signIn(): Promise<AccessToken> {
  const config: NativeAppAuthorizationConfiguration = {
    clientId: "imodeljs-electron-samples",
    redirectUri: "http://localhost:3000/signin-callback",
    scope: "openid email profile organization imodelhub context-registry-service:read-only product-settings-service urlps-third-party offline_access",
  };

  const client = new ElectronAuthorizationBackend();
  await client.initialize(config);

  return new Promise<AccessToken>((resolve, reject) => {
    NativeHost.onUserStateChanged.addListener((token) => {
      if (token !== undefined) {
        resolve(token);
      } else {
        reject(new Error("Failed to sign in"));
      }
    });
    client.signIn().catch((err) => reject(err));
  });
}

export async function main(process: NodeJS.Process): Promise<void> {
  try {
    await IModelHost.startup();

    const accessToken: AccessToken = await signIn();

    let userdata;
    const json = process.argv[2];
    if (json === undefined) {
      userdata = require("../queries/example.json");
    } else {
      userdata = require(json);
    }

    const url = new URL(userdata.url.toLowerCase());
    const projectId: string = url.searchParams.get("projectid") ?? "";
    const iModelId: string = url.searchParams.get("imodelid") ?? "";
    const changeSetId: string = url.searchParams.get("changesetid") ?? "";

    const version = changeSetId === "" ? IModelVersion.latest() : IModelVersion.asOfChangeSet(changeSetId);

    const guidRegex = new RegExp("[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}");
    if (!guidRegex.test(projectId) || !guidRegex.test(iModelId)) {
      console.error("Error in parsing url from query");
      return;
    }

    // If this function returns non-zero, the download is aborted.
    const progressTracking: ProgressFunction = (loaded: number, total: number): number => {
      const percent = loaded / total * 100;
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Downloaded: ${percent.toFixed(2)} %`);

      return 0;
    };

    console.log(`Started opening iModel (projectId=${projectId}, iModelId=${iModelId}, changeSetId=${changeSetId})`);
    const requestContext: AuthorizedClientRequestContext = new AuthorizedClientRequestContext(accessToken);
    const requestNewBriefcaseArg: RequestNewBriefcaseArg = { contextId: projectId, iModelId, asOf: version.toJSON(), briefcaseId: 0, onProgress: progressTracking };
    const briefcaseProps = await BriefcaseManager.downloadBriefcase(requestContext, requestNewBriefcaseArg);
    requestContext.enter();

    const iModelDb = await BriefcaseDb.open(requestContext, briefcaseProps);
    requestContext.enter();
    console.log("\nFinished opening iModel");

    const exporter = new DataExporter(iModelDb);
    exporter.setFolder(userdata.folder);

    for (const querykey of Object.keys(userdata.queries)) {
      const aQuery = userdata.queries[querykey];
      const fileName = `${aQuery.store !== undefined ? aQuery.store : querykey}.csv`;
      await exporter.writeQueryResultsToCsv(aQuery.query, fileName, aQuery.options);
    }

    iModelDb.close();
  } catch (error) {
    console.error(`${error.message}\n${error.stack}`);
  } finally {
    await IModelHost.shutdown();
  }
}

if (require.main === module) {
  (async () => {
    await main(process);
  })().catch((err) => {
    if (err instanceof BentleyError)
      process.stderr.write(`Error: ${err.name}: ${err.message}`);
    else
      process.stderr.write(`Unknown error: ${err.message}`);
    process.exit(err.errorNumber ?? -1);
  });
}
