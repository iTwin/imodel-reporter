/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbResult, Id64Array, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { BackendRequestContext, ECSqlStatement, IModelDb } from "@bentley/imodeljs-backend";
import { MassPropertiesOperation, MassPropertiesRequestProps } from "@bentley/imodeljs-common";
import * as path from "path";
import * as fs from "fs";

const loggerCategory = "DataExporter";

export interface Options {
  calculateMassProperties: boolean;
  idColumn: number;
  idColumnIsJsonArray: boolean;
  dropIdColumnFromResult: boolean;
}

interface MassProps {
  totalCount: number;
  volume: number;
  volumeCount: number;
  area: number;
  areaCount: number;
  length: number;
  lengthCount: number;
}

const defaultOptions: Options = {
  calculateMassProperties: false,
  idColumn: 0,
  idColumnIsJsonArray: false,
  dropIdColumnFromResult: false,
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

  private rowToString(statement: ECSqlStatement, columnToSkip: number): string {
    const valuesRow: string[] = [];
    const replacer = (_key: string, value: any) => (value === null) ? undefined : value;

    for (let i = 0; i < statement.getColumnCount(); i++) {
      if (i === columnToSkip) {
        continue;
      }
      const value = statement.getValue(i).value;
      valuesRow.push(JSON.stringify(value, replacer));
    }

    const outRow = valuesRow.join(";");
    return outRow;
  }

  private makeHeader(header: string[], statement: ECSqlStatement, columnToSkip?: number): string {
    for (let i = 0; i < statement.getColumnCount(); i++) {
      if (i === columnToSkip) {
        continue;
      }
      header.push(statement.getValue(i).columnInfo.getAccessString());
    }

    const outHeader = header.join(";");
    return outHeader;
  }

  private async calculateMassProps(ids: Id64Array): Promise<MassProps> {
    const result: MassProps = { totalCount: ids.length, volume: 0, volumeCount: 0, area: 0, areaCount: 0, length: 0, lengthCount: 0 };

    const requestContext = new BackendRequestContext();
    let count = 0;
    for (const id of ids) {
      const requestProps: MassPropertiesRequestProps = {
        operation: MassPropertiesOperation.AccumulateVolumes,
        candidates: [id],
      };
      if (count > 0 && count % 1000 === 0) {
        console.log(`Calculated ${count} mass properties: \n${JSON.stringify(result)}`);
      }
      ++count;
      const volumeProps = await this._iModelDb.getMassProperties(requestContext, requestProps);
      const volume = volumeProps.volume ?? 0;
      if (volume !== 0) {
        result.volume += volume;
        result.volumeCount += 1;
      }
      requestProps.operation = MassPropertiesOperation.AccumulateAreas;
      const areaProps = await this._iModelDb.getMassProperties(requestContext, requestProps);
      const area = areaProps.area ?? 0;
      if (area !== 0) {
        result.area += area;
        result.areaCount += 1;
      }
      requestProps.operation = MassPropertiesOperation.AccumulateLengths;
      const lengthProps = await this._iModelDb.getMassProperties(requestContext, requestProps);
      const length = lengthProps.length ?? 0;
      if (length !== 0) {
        result.length += length;
        result.lengthCount += 1;
      }
    }

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
      const header: string[] = (options.calculateMassProperties) ? ["total_count", "volume", "volume_count", "area", "area_count", "length", "length_count"] : [];
      const outHeader = this.makeHeader(header, statement, options.dropIdColumnFromResult ? options.idColumn : -1);
      writeStream.write(`${outHeader}\n`);
    }

    let rowCount = 0;
    while (DbResult.BE_SQLITE_ROW === statement.step()) {
      const stringifiedRow = this.rowToString(statement, options.dropIdColumnFromResult ? options.idColumn : -1);
      if (options.calculateMassProperties === true) {
        if (options.idColumnIsJsonArray === true) {
          ids = JSON.parse(statement.getValue(options.idColumn).getString()) as Id64Array;
        } else {
          ids = [statement.getValue(options.idColumn).getId()];
        }
        const result = await this.calculateMassProps(ids);
        writeStream.write(`${result.totalCount};${result.volume};${result.volumeCount};${result.area};${result.areaCount};${result.length};${result.lengthCount};${stringifiedRow}\n`);
      } else {
        writeStream.write(`${stringifiedRow}\n`);
      }
      rowCount++;
      if (rowCount % 1000 === 0) {
        console.log(`${rowCount} rows processed so far`);
      }
    }

    console.log(`Written ${rowCount} rows to file: ${outputFileName}`);
    return new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      writeStream.end();
    });
  }
}
