/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64Array, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { BackendRequestContext, ECSqlStatement, IModelDb } from "@bentley/imodeljs-backend";
import { MassPropertiesOperation, MassPropertiesRequestProps, MassPropertiesResponseProps } from "@bentley/imodeljs-common";
import * as path from "path";
import * as fs from "fs";

const loggerCategory = "DataExporter";

export interface Options {
  calculateMassProperties: boolean;
  idColumn: number;
  idColumnIsJsonArray: boolean;
}

const defaultOptions: Options = {
  calculateMassProperties: false,
  idColumn: 0,
  idColumnIsJsonArray: false,
};

export class DataExporter {
  private _iModelDb: IModelDb;
  private _outputDir: string;

  public constructor(iModelDb: IModelDb) {
    this._iModelDb = iModelDb;
    this._outputDir = path.join(__dirname, "..", "out");

    // initialize logging
    Logger.initializeToConsole();
    Logger.setLevelDefault(LogLevel.Error);
    Logger.setLevel(loggerCategory, LogLevel.Trace);
  }

  public setFolder(folder: string): void {
    this._outputDir = path.join(__dirname, "..", "out", folder);
    if (fs.existsSync(this._outputDir)) {
      try {
        fs.rmdirSync(this._outputDir, { recursive: true });
      } catch (error) {
        console.error(error.message);
      }
    }

    try {
      fs.mkdirSync(this._outputDir, { recursive: true });
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

    const outHeader = header.join(";");
    return outHeader;
  }

  private async calculateVolume(ids: Id64Array): Promise<MassPropertiesResponseProps> {
    const requestProps: MassPropertiesRequestProps = {
      operation: MassPropertiesOperation.AccumulateVolumes,
      candidates: ids,
    };

    const requestContext = new BackendRequestContext();
    const result = await this._iModelDb.getMassProperties(requestContext, requestProps);

    // Trying to calculate volume on 2d geometry returns volume as undefined
    result.volume = result.volume || 0;
    // Trying to calculate perimeter on 3d geometry returns perimeter as undefined
    result.perimeter = result.perimeter || 0;

    return result;
  }

  private assignDefaultOptions(options: Partial<Options> = {}): Options {
    return { ...defaultOptions, ...options };
  }

  public async writeQueryResultsToCsv(ecSql: string, fileName: string, options: Partial<Options> = {}): Promise<void> {
    const outputFileName: string = path.join(this._outputDir, fileName);
    const opts = this.assignDefaultOptions(options);

    await this._iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {
      await this.writeQueries(statement, outputFileName, opts);
    });
  }

  private async writeQueries(statement: ECSqlStatement, outputFileName: string, options: Options): Promise<void> {
    const writeHeaders = !fs.existsSync(outputFileName);
    const writeStream = fs.createWriteStream(outputFileName, { flags: "a" });
    let ids: Id64Array = [];

    if (writeHeaders) {
      const header: string[] = (options.calculateMassProperties) ? ["volume", "area"] : [];
      const outHeader = this.makeHeader(header, statement);
      writeStream.write(`${outHeader}\n`);
    }

    let rowCount = 0;
    while (DbResult.BE_SQLITE_ROW === statement.step()) {
      const stringifiedRow = this.rowToString(statement);
      if (options.calculateMassProperties === true) {
        if (options.idColumnIsJsonArray === true) {
          ids = JSON.parse(statement.getValue(options.idColumn).getString()) as Id64Array;
        } else {
          ids = [statement.getValue(options.idColumn).getId()];
        }

        const result = await this.calculateVolume(ids);
        writeStream.write(`${result.volume};${result.area};${stringifiedRow}\n`);
      } else {
        writeStream.write(`${stringifiedRow}\n`);
      }
      rowCount++;
    }

    console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    return new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      writeStream.end();
      writeStream.close();
    });
  }
}
