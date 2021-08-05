/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

import { Id64Array } from "@bentley/bentleyjs-core";
import { IModelHost, IModelJsFs, SnapshotDb } from "@bentley/imodeljs-backend";

import { DataExporter, Options } from "../DataExporter";
import { populateSourceDb, prepareSourceDb } from "./iModelUtils";

describe("DataExporter.test.ts", () => {
  let sourceDbFile = "";
  let sourceDb: SnapshotDb;
  let userdata: any;

  before(async () => {
    await IModelHost.startup();
    sourceDbFile = path.join(__dirname, "TestiModel.bim");
    if (fs.existsSync(sourceDbFile))
      fs.unlinkSync(sourceDbFile);

    sourceDb = SnapshotDb.createEmpty(sourceDbFile, { rootSubject: { name: "TestIModel" } });
    await prepareSourceDb(sourceDb);

    populateSourceDb(sourceDb);
    sourceDb.saveChanges();
  });

  after(async () => { await IModelHost.shutdown(); });

  it("CSV files are correctly generated from imodel", async () => {
    const exporter = new DataExporter(sourceDb);
    userdata = require("./assets/TestQueries.json");
    exporter.setFolder(userdata.folder);
    const outFiles = ["2dElements", "3dElements", "class", "schema", "volumeForGroupIds", "volumeForSingleIds"].map((file) => `${file}.csv`);

    for (const querykey of Object.keys(userdata.queries)) {
      const aQuery = userdata.queries[querykey];
      const fileName = `${aQuery.store !== undefined ? aQuery.store : querykey}.csv`;
      await exporter.writeQueryResultsToCsv(aQuery.query, fileName, aQuery.options);
    }
    const outDir = path.join(__dirname, "..", "..", "out", userdata.folder);

    expect(IModelJsFs.existsSync(outDir)).to.equal(true);
    expect(IModelJsFs.readdirSync(outDir)).to.have.members(outFiles);
  });

  describe("Default options for query", () => {
    it("Should assign default values to query options, if options are not provided", () => {
      const exporter = new DataExporter(sourceDb);
      const options = exporter["assignDefaultOptions"]();
      expect(options.calculateMassProperties).is.false;
      expect(options.idColumn).is.equal(0);
      expect(options.idColumnIsJsonArray).is.false;
      expect(options.dropIdColumnFromResult).is.false;
    });

    it("Should not assign default values to already defined options", () => {
      const exporter = new DataExporter(sourceDb);
      const options: Options = {
        calculateMassProperties: true,
        idColumn: 15,
        idColumnIsJsonArray: true,
        dropIdColumnFromResult: true,
      };
      const opts = exporter["assignDefaultOptions"](options);
      expect(opts.calculateMassProperties).is.true;
      expect(opts.idColumn).to.equal(15);
      expect(opts.idColumnIsJsonArray).is.true;
      expect(opts.dropIdColumnFromResult).is.true;
    });
  });

  describe("Volume calculation", () => {
    it("Should return zero instead of undefined if object doesn't have volume", async () => {
      const exporter = new DataExporter(sourceDb);
      const ids: Id64Array = ["0x2b"]; // Id of existing 2D Geometry element from the test iModel.
      const results = await exporter["calculateMassProps"](ids);
      expect(results.volume).is.equal(0);
    });
  });
});
