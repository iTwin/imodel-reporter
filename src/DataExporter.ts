/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as path from "path";
import * as fs from "fs";
import { ECSqlStatement } from "@itwin/core-backend/lib/cjs/ECSqlStatement";
import { IModelDb } from "@itwin/core-backend/lib/cjs/IModelDb";
import { DbResult } from "@itwin/core-bentley/lib/cjs/BeSQLite";
import { Id64Array } from "@itwin/core-bentley/lib/cjs/Id";
import { Logger, LogLevel } from "@itwin/core-bentley/lib/cjs/Logger";
import { MassPropertiesRequestProps, MassPropertiesOperation } from "@itwin/core-common/lib/cjs/MassProperties";

const APP_LOGGER_CATEGORY = "imodel-report-main";

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
    Logger.setLevel(APP_LOGGER_CATEGORY, LogLevel.Trace);
  }

  public setFolder(folder: string): void {
    this._outputDir = path.join(__dirname, "..", "out", folder);
    if (fs.existsSync(this._outputDir)) {
      try {
        fs.rmdirSync(this._outputDir);
      } catch (e) {
        const error = e as Error;
        Logger.logError(APP_LOGGER_CATEGORY, error.message);
      }
    }

    try {
      fs.mkdirSync(this._outputDir, { recursive: true });
    } catch (e) {
      const error = e as Error;
      Logger.logError(APP_LOGGER_CATEGORY, error.message);
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

  private async calculateMassProps(ids: Id64Array, geometryCalculationSkipList: string[] = []): Promise<MassProps> {
    const result: MassProps = { totalCount: ids.length, volume: 0, volumeCount: 0, area: 0, areaCount: 0, length: 0, lengthCount: 0 };

    let count = 0;
    for (const id of ids) {
      const requestProps: MassPropertiesRequestProps = {
        operation: MassPropertiesOperation.AccumulateVolumes,
        candidates: [id],
      };
      if (count > 0 && count % 1000 === 0) {
        Logger.logInfo(APP_LOGGER_CATEGORY,`Calculated ${count} of ${ids.length} mass properties`);
      }
      // if (geometryCalculationSkipList.includes(id)) {
      //   console.log(`Skipping element with id ${id}`);
      //   continue;
      // }
      // Uncomment to print out id of element.  If calculating mass props is crashing the last id printed is the id causing the crash, add it to the list and restart the process.
      // console.log(`Calculating geometry for Element ${id}`);
      ++count;
      const volumeProps = await this._iModelDb.getMassProperties(requestProps);
      const volume = volumeProps.volume ?? 0;
      if (volume !== 0) {
        result.volume += volume;
        result.volumeCount += 1;
        // console.log("volume");
      }
      if (geometryCalculationSkipList.includes(id)) {
        Logger.logInfo(APP_LOGGER_CATEGORY,`Skipping area for element with id ${id}`);
      } else {
        requestProps.operation = MassPropertiesOperation.AccumulateAreas;
        const areaProps = await this._iModelDb.getMassProperties(requestProps);
        const area = areaProps.area ?? 0;
        if (area !== 0) {
          result.area += area;
          result.areaCount += 1;
          // console.log("area");
        }
      }
      requestProps.operation = MassPropertiesOperation.AccumulateLengths;
      const lengthProps = await this._iModelDb.getMassProperties(requestProps);
      const length = lengthProps.length ?? 0;
      if (length !== 0) {
        result.length += length;
        result.lengthCount += 1;
        // console.log("length");
      }
    }
    return result;
  }

  private assignDefaultOptions(options: Partial<Options> = {}): Options {
    return { ...defaultOptions, ...options };
  }

  public async writeQueryResultsToCsv(ecSql: string, fileName: string, options: Partial<Options> = {}, geometryCalculationSkipList: string[] = []): Promise<void> {
    const outputFileName: string = path.join(this._outputDir, fileName);
    const opts = this.assignDefaultOptions(options);

    await this._iModelDb.withPreparedStatement(ecSql, async (statement: ECSqlStatement): Promise<void> => {
      await this.writeQueries(statement, outputFileName, opts, geometryCalculationSkipList);
    });
  }

  private async writeQueries(statement: ECSqlStatement, outputFileName: string, options: Options, geometryCalculationSkipList: string[] = []): Promise<void> {
    const writeHeaders = !fs.existsSync(outputFileName);
    const writeStream = fs.createWriteStream(outputFileName, { flags: "a" });
    let ids: Id64Array = [];

    if (writeHeaders) {
      const header: string[] = (options.calculateMassProperties) ? ["volume", "volume_si", "area", "area_si", "length", "length_si"] : [];
      const outHeader = this.makeHeader(header, statement, options.calculateMassProperties ? options.idColumn : -1);
      writeStream.write(`${outHeader}\n`);
    }

    let rowCount = 0;
    while (DbResult.BE_SQLITE_ROW === statement.step()) {
      const stringifiedRow = this.rowToString(statement, options.calculateMassProperties ? options.idColumn : -1);
      if (options.calculateMassProperties === true) {
        if (options.idColumnIsJsonArray === true) {
          ids = JSON.parse(statement.getValue(options.idColumn).getString()) as Id64Array;
        } else {
          ids = [statement.getValue(options.idColumn).getId()];
        }
        // Uncomment to find the row in the query results.  Helpful if you have a crash and want to restart the calculations part way through a query.
        // console.log(`Calculating mass properties for row ${rowCount} for ${ids.length} elements.`);
        const result = await this.calculateMassProps(ids, geometryCalculationSkipList);
        writeStream.write(`${result.volume};${result.volumeCount / result.totalCount};${result.area};${result.areaCount / result.totalCount};${result.length};${result.lengthCount / result.totalCount};${stringifiedRow}\n`);
      } else {
        writeStream.write(`${stringifiedRow}\n`);
      }
      rowCount++;
      if (rowCount % 1000 === 0) {
        Logger.logInfo(APP_LOGGER_CATEGORY,`${rowCount} rows processed so far`);
      }
    }

    Logger.logInfo(APP_LOGGER_CATEGORY,`Written ${rowCount} rows to file: ${outputFileName}`);
    return new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      writeStream.end();
    });
  }
}
