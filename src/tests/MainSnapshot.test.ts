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
  let sourceDb: any;
  let userdata : any;

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
    const exporter:any = new DataExporter(sourceDb);
    userdata = require("./assets/TestQueries.json");
    exporter.setfolder(userdata.folder);
    const outFiles = Object.keys(userdata.queries).map(file => userdata.queries[file].store+".csv");

      for (const querykey of Object.keys(userdata.queries)) {
        const aQuery:any = userdata.queries[querykey];
        exporter.writeQueryResultsToCsvFile(aQuery.query,aQuery.store + ".csv");
      }
      const outDir = path.join(__dirname, "/../../out/" + userdata.folder);

      expect(IModelJsFs.existsSync(outDir)).to.equal(true);
      expect(IModelJsFs.readdirSync(outDir)).to.have.members(outFiles);
  });
});