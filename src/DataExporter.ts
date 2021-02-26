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
interface Options {
  calculateMassProperties: boolean;
  idColumn: number;
  idColumnIsJsonArray: boolean;
}
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
  
  private makeHeader(header: string[], statement: ECSqlStatement): string {
    for (let i = 0; i < statement.getColumnCount(); i++) {
      header.push(statement.getValue(i).columnInfo.getAccessString());
    }

    const outHeader = header.join(';');
    return outHeader;
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

  public async writeQueryResultsToCsv(ecSql: string, fileName: string, options:  Partial<Options> = {}): Promise<void> {
    const outputFileName: string = path.join(this.outputDir, fileName); 
    
    const opts = Object.assign({
      calculateMassProperties: false,
      idColumn: 0,
      idColumnIsJsonArray: false,
    }, options);

    await this.iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {     
        if (opts.calculateMassProperties === true) {
          await this.writeVolume(statement, outputFileName, opts);
        } else {
          await this.defaultWrite(statement, outputFileName);
        }
      }
    );
  }

  private async writeVolume(statement: ECSqlStatement, outputFileName: string, options: Options): Promise<void> {
    const writeStream = fs.createWriteStream(outputFileName);
    let rowCount = 0;
    let ids: Id64Array = [];
    const header: string[] = ["volume","area"];

    let outHeader: string;
    if (options.idColumnIsJsonArray) {
      header.push("CodeValue");
      outHeader = header.join(';');
    } else {
      outHeader = this.makeHeader(header, statement)    
    }
    writeStream.write(`${outHeader}\n`);

    while (DbResult.BE_SQLITE_ROW === statement.step()) {
      let result;
      if(options.idColumnIsJsonArray === true) {
        const parsedIds: Id64Array = <Id64Array>JSON.parse(statement.getValue(options.idColumn).getString());
        result = await this.calculateVolume(parsedIds);
        writeStream.write(`${result.volume};${result.area};${statement.getValue(1).getString()}\n`);      
      } else {
        const stringifiedRow = this.rowToString(statement);
        ids.push(statement.getValue(options.idColumn).getId());
        result = await this.calculateVolume(ids)
        ids = [];
        writeStream.write(`${result.volume};${result.area};${stringifiedRow}\n`);
      }
      ++rowCount;
    }

    writeStream.on("finish", () => {
     console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    });

    writeStream.end();
  }

  private async defaultWrite(statement: ECSqlStatement, outputFileName: string): Promise<void> {
    const writeStream = fs.createWriteStream(outputFileName);
    const outHeader = this.makeHeader([], statement)
    writeStream.write(`${outHeader}\n`);
    
    let rowCount = 0;
    while (DbResult.BE_SQLITE_ROW === statement.step()) {
      const stringifiedRow = this.rowToString(statement);
      writeStream.write(`${stringifiedRow}\n`);
      rowCount++;
    }

    writeStream.on("finish", () => {
      console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    });

    writeStream.end();
  }
}
