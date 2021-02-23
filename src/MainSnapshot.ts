/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import { DataExporter } from "./DataExporter";
import * as fs from "fs";

export async function mainSnapshot(process: NodeJS.Process): Promise<void> {
  try {
    let userdata;

    const fileName: string = process.argv[2];
    const json: string = process.argv[3];

    IModelHost.startup();
    if (fileName === undefined) {
      console.error("Filename not provided");
      return;
    }
    if (!fs.existsSync(fileName)) {
      console.error(`Could not find the iModel at location '${fileName}'`);
      return;
    }
    if (json === undefined) {
        userdata = require("../queries/example.json");
    } else {
        userdata = require(json);
    }

    await IModelHost.startup();

    const sourceDbFile = fileName;
    const sourceDb = SnapshotDb.openFile(sourceDbFile);
    const exporter = new DataExporter(sourceDb);
    exporter.setfolder(userdata.folder);

    let queryCount = 0;
    for (const querykey of Object.keys(userdata.queries)) {
      queryCount++;
      const aQuery = userdata.queries[querykey];
      exporter.writeQueryResultsToCsvFile(aQuery.query, aQuery.store + ".csv");
    }

    console.log(`Number of Queries = ${queryCount}`);
    sourceDb.close();
  } catch (error) {
    console.error(`${error.message} \n ${error.stack}`);
  }
  finally {
    await IModelHost.shutdown();
  }
}

// invoke main if MainSnapshot.js is being run directly
if (require.main === module) {
  if (process.argv.length < 3) {
    console.error("Please provide valid arguments: npm run start:snapshot <file path> <query.json>");
  } else {
    mainSnapshot(process);
  }
}
