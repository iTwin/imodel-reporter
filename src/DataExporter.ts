/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64Array, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { BackendRequestContext, ECSqlStatement, IModelDb } from "@bentley/imodeljs-backend";
import { MassPropertiesOperation, MassPropertiesRequestProps, MassPropertiesResponseProps } from "@bentley/imodeljs-common";
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

  private getColumns(statement: ECSqlStatement): string[] {
    const columns: string[] = [];
    for (let i = 0; i < statement.getColumnCount(); i++) {
      columns.push(statement.getValue(i).columnInfo.getAccessString());
    }
    return columns;
  }
  
  private async calculateVolume(ids: Id64Array): Promise<MassPropertiesResponseProps> {
    const requestProps: MassPropertiesRequestProps = {
      operation: MassPropertiesOperation.AccumulateVolumes,
      candidates: ids,
    };
    
    const requestContext = new BackendRequestContext();
    const result = await this.iModelDb.getMassProperties(requestContext, requestProps);

    return result;
  }

  public async writeVolumesForSingles(ecSql: string, fileName: string): Promise<void> {
    const outputFileName = path.join(this.outputDir, fileName);
    const writeStream = fs.createWriteStream(outputFileName);
    let rowCount = 0;
    let id: Id64Array = [];
    const header: string[] = ["volume","area"];

    await this.iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {
      if (0 === rowCount) {
        header.push (...this.getColumns(statement));
        const outHeader = header.join(';');
        writeStream.write(`${outHeader}\n`);
      }

      while (DbResult.BE_SQLITE_ROW === statement.step()) {     
        id.push(statement.getValue(0).getId());
        const result = await this.calculateVolume(id);
        const stringifiedRow = this.rowToString(statement);
        writeStream.write(`${result.volume};${result.area};${stringifiedRow}\n`);

        rowCount++;
        id = [];
      }
    });
    writeStream.end();
  }

  public async writeVolumesForGroups(ecSql: string, fileName: string): Promise<void> {
    const outputFileName = path.join(this.outputDir, fileName);
    const writeStream = fs.createWriteStream(outputFileName);
    let rowCount = 0;
    const header: string[] = ["volume","area"];
    
    await this.iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {
      if (0 === rowCount) {
        header.push ("CodeValue");
        const outHeader = header.join(';');
        writeStream.write(`${outHeader}\n`);
      }

      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const parsedIds: Id64Array = <Id64Array>JSON.parse(statement.getValue(0).getString());
        const result = await this.calculateVolume(parsedIds);      
        writeStream.write(`${result.volume};${result.area};${statement.getValue(1).getString()}\n`);
        ++rowCount;
      }
    });

    writeStream.on("finish", () => {
      console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    });

    writeStream.end();
  }

  public writeQueryResultsToCsvFile(ecSql: string, fileName: string): void {
    const outputFileName: string = path.join(this.outputDir, fileName);
    const writeStream = fs.createWriteStream(outputFileName);
    
    let rowCount = 0;
    const header: string[] = [];
   
    this.iModelDb.withPreparedStatement(ecSql, (statement: ECSqlStatement): void => {
      if (0 === rowCount) {
          header.push (...this.getColumns(statement));
          const outHeader = header.join(';');
          writeStream.write(outHeader);
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
