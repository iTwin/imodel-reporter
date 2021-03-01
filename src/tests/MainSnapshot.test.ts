/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import * as fs from "fs";
import { DataExporter, Options } from "../DataExporter";
import { populateSourceDb, prepareSourceDb } from "./iModelUtils";
import { IModelJsFs} from "@bentley/imodeljs-backend";
import {expect} from "chai";
import * as path from "path";
import { Id64Array } from "@bentley/bentleyjs-core";

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
    exporter.setfolder(userdata.folder);
    const outFiles = Object.keys(userdata.queries).map(file => file + ".csv");

    for (const querykey of Object.keys(userdata.queries)) {
      const aQuery = userdata.queries[querykey];
      await exporter.writeQueryResultsToCsv(aQuery.query, querykey + ".csv", aQuery.options)
    }
   const outDir = path.join(__dirname, "/../../out/" + userdata.folder);

    expect(IModelJsFs.existsSync(outDir)).to.equal(true);
    expect(IModelJsFs.readdirSync(outDir)).to.have.members(outFiles);
  });

  describe("Default options for query", () => {
    it ("Should assign default values to query options, if options are not provided", () =>
    {
      const exporter = new DataExporter(sourceDb);    
      const options = exporter["assignDefaultOptions"]();
      expect(options.calculateMassProperties === false);
      expect(options.idColumn === 0);
      expect(options.idColumnIsJsonArray === false);
    });

    it ("Should not assign default values to already defined options", () => {
      const exporter = new DataExporter(sourceDb); 
      const options: Options = {
        calculateMassProperties: true,
        idColumn: 15,
        idColumnIsJsonArray: true
      }
      const opts = exporter["assignDefaultOptions"](options);
      expect(opts.calculateMassProperties === true);
      expect(opts.idColumn === 15);
      expect(opts.idColumnIsJsonArray === true);
    })
  });

  describe("Volume calculation", () => {
    it ("Should return zero instead of undefined if object doesnt have volume", async () => {
      const exporter = new DataExporter(sourceDb);
      const ids: Id64Array = ['0x2b']; //Id of existing 2dgeometry element from the test iModel.
      const results = await exporter["calculateVolume"](ids);
      expect(results.volume !== undefined);
      }
    )});
});