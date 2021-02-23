/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ECSqlStatement, IModelDb } from "@bentley/imodeljs-backend";
import * as path from "path";
import * as  fs  from "fs";
const loggerCategory = "DataExporter";

export class DataExporter {
  private iModelDb: IModelDb;
  private outputDir: string;

  public constructor(iModelDb: IModelDb) {
    this.iModelDb = iModelDb;
    this.outputDir = path.join(__dirname, "../out/" );

    // initialize logging
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel(loggerCategory, LogLevel.Trace);
  }

  public setfolder(folder: string): void {
    this.outputDir = path.join(__dirname, "../out/" + folder);
    if (fs.existsSync(this.outputDir)) {
      try {
        fs.rmdirSync(this.outputDir, { recursive: true });
      } catch (error) {
        console.error(error.message);
      }
    }

    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
    } catch (error) {
      console.error(error.message);
    }
  }

  private rowToString(statement: ECSqlStatement): string {
    const valuesRow: string[] = [];
    const replacer = (_key: string, value: any) => (value === null) ? undefined : value;

    for (let i = 0; i < statement.getColumnCount(); i++) {
      const value = statement.getValue(i).value;
      valuesRow.push(JSON.stringify(value, replacer));
    }

    const outRow = valuesRow.join(";");
    return outRow;
  }

  public writeQueryResultsToCsvFile(ecSql: string, fileName: string): void {
    const outputFileName: string = path.join(this.outputDir, fileName);
    const writeStream = fs.createWriteStream(outputFileName);
    
    let rowCount = 0;
    const header: string[] = [];
   
    this.iModelDb.withPreparedStatement(ecSql, (statement: ECSqlStatement): void => {
      if (DbResult.BE_SQLITE_ROW === statement.step()) {
        for (let i = 0; i < statement.getColumnCount(); i++) {
          header.push(statement.getValue(i).columnInfo.getAccessString());
        }   
        const outHeader: string = header.join(";");
        writeStream.write(`${outHeader}\n`);
        writeStream.write(`${this.rowToString(statement)}\n`);
        rowCount++;
      }

      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const stringifiedRow = this.rowToString(statement);
        writeStream.write(`${stringifiedRow}\n`);
        rowCount++;
      }
    });
    
     writeStream.on("finish", () => {
      console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    });

    writeStream.end();
  }
}
