/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import * as fs from "fs";
import { DataExporter } from "../DataExporter";
import { populateSourceDb, prepareSourceDb } from "./iModelUtils";
import { IModelJsFs} from "@bentley/imodeljs-backend";
import {expect} from "chai";
import * as path from "path";

describe("DataExporter.test.ts",()=> {
  let sourceDbFile = "";
  let sourceDb: SnapshotDb;
  let userdata: any;

  before(async () => {
    await IModelHost.startup();
    sourceDbFile = __dirname + "/TestiModel.bim";
    if (fs.existsSync(sourceDbFile)) {
      fs.unlinkSync(sourceDbFile);
    }
    sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "TestIModel" } });
    await prepareSourceDb(sourceDb);

    populateSourceDb(sourceDb);
    sourceDb.saveChanges();
  });

  after( async ()=> { await IModelHost.shutdown(); });

  it("CSV files are correctly generated from imodel", async ()=> {
    const exporter = new DataExporter(sourceDb);
    userdata = require("./assets/TestQueries.json");
    const genericFolder = `${userdata.folder}/test`;
    exporter.setfolder(genericFolder);
    const outFiles = Object.keys(userdata.queries["test"]).map(file => userdata.queries["test"][file].store+".csv");

    for (const querykey of Object.keys(userdata.queries["test"])) {
      const aQuery = userdata.queries["test"][querykey];
      exporter.writeQueryResultsToCsvFile(aQuery.query,aQuery.store + ".csv");
    }
    const outDir = path.join(__dirname, "/../../out/" + genericFolder);

    expect(IModelJsFs.existsSync(outDir)).to.equal(true);
    expect(IModelJsFs.readdirSync(outDir)).to.have.members(outFiles);
  });
});