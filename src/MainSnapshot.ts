/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BentleyError } from "@bentley/bentleyjs-core";
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import { DataExporter } from "./DataExporter";
import * as fs from "fs";

export async function mainSnapshot(process: NodeJS.Process): Promise<void> {
  try {
    let userdata;

    const fileName: string = process.argv[2];
    const json: string = process.argv[3];

    await IModelHost.startup();

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

    const sourceDbFile = fileName;
    const sourceDb = SnapshotDb.openFile(sourceDbFile);
    const exporter = new DataExporter(sourceDb);
    exporter.setFolder(userdata.folder);

    for (const querykey of Object.keys(userdata.queries)) {
      const aQuery = userdata.queries[querykey];
      const outFileName = `${aQuery.store !== undefined ? aQuery.store : querykey}.csv`;
      await exporter.writeQueryResultsToCsv(aQuery.query, outFileName, aQuery.options);
    }

    sourceDb.close();
  } catch (error) {
    console.error(`${error.message} \n ${error.stack}`);
  } finally {
    await IModelHost.shutdown();
  }
}

// invoke main if MainSnapshot.js is being run directly
if (require.main === module) {
  (async () => {
    if (process.argv.length < 3)
      throw new Error("Please provide valid arguments: npm run start:snapshot <file path> <query.json>");

    await mainSnapshot(process);
  })().catch((err) => {
    if (err instanceof BentleyError)
      process.stderr.write(`Error: ${err.name}: ${err.message}`);
    else
      process.stderr.write(`Unknown error: ${err.message}`);
    process.exit(err.errorNumber ?? -1);
  });
}
