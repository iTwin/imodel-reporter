# Introduction

![ci workflow](https://github.com/imodeljs/imodel-reporter/actions/workflows/ci.yaml/badge.svg)

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

The iModel Reporter is a simple command line app to generate csv reports from an iModel.

## Table of contents

- [Pre-reqs](#pre-reqs)
  - [Creating a test iModel](#creating-test-imodel)
  - [Client registration](#client-registration)
- [Getting started](#getting-started)
- [Data Exporter](#data-exporter)
  - [Query file structure](#query-file-structure)
  - [Example query](#example-query)
  - [Project Structure](#project-structure)
- [Testing](#testing)

## Pre-reqs

To build and run this app locally you will need a few things:

- Install [Git](https://git-scm.com/)
- Install [Node.js](https://nodejs.org/en/) v18 (must be at least 18.0.0)
- Install [VS Code](https://code.visualstudio.com/)

### Creating a test iModel

To successfully run this tool you will need to have an accessible iModel. If you don't have one already [this](https://www.itwinjs.org/learning/tutorials/create-test-imodel-sample/) guide will help you to create it.
If you want to create iModel in your local environment then follow  [this](https://www.itwinjs.org/learning/tutorials/create-test-imodel-offline/) tutorial.

## Getting started

- Clone the repository

  ```sh
  git clone <github link>
  ```

- Install dependencies

  ```sh
  cd <project_name>
  npm install
  ```

- Build and run the project

  ```sh
  npm run build
  npm run start <query.json>           # Run with iModel from hub
  ```

## Using Data Exporter

Detailed description of the project

### Query file structure

Query file structure below.

| Name | Description |
| ------------------------ | ---------------------------------------------------------------------------
| **name**           | name for your queries set                                                        |
| **description**    | description for your queries                                               |
| **url**            | link to your iModel project                                        |
| **folder**         | name of the folder where queries results will be saved                           |
| **queries**        | array for your queries                                                |
| **info**           | (optional) info about the query                                                  |
| **query**          | ECSql query to be executed                                            |
| **options**        | query options, if none are specified default ones will be used instead           |

### Example query

An example query file with four simple queries.

Example supports three types of queries: generic queries; calculating volume of single physical element; calculating total volume sum of group of elements.
> Note: **Don't forget to change url to accessible iModel if you want to run this example**

```json
{
  "name": "example",
  "description": "simple example queries on how tool works",
  "url" : "https://connect-imodelweb.bentley.com/imodeljs/?projectId=<put your project id here>&iModelId=<put your model id here>&ChangeSetId=<put your changeset id here>",
  "folder" : "./example",
  "queries" : {
    "schema" : {
      "store" : "schema",
      "query" : "SELECT DISTINCT schema.Name, schema.VersionMajor, schema.VersionWrite, schema.VersionMinor, schema.DisplayLabel, schema.Description FROM ECDbMeta.ECSchemaDef schema JOIN ECDbMeta.ECClassDef class ON class.Schema.Id = schema.ECInstanceId WHERE class.ECInstanceId in (SELECT DISTINCT(ECClassId) FROM Bis.Element)"
      },
    "class" : {
      "store" : "class",
      "query" : "SELECT COUNT(e.ECInstanceId) as [Count], e.ECClassId, class.DisplayLabel, class.Description FROM Bis.Element e JOIN ECDbMeta.ECClassDef class ON class.ECInstanceId = e.ECClassId GROUP BY e.ECClassId ORDER BY ec_classname(e.ECClassId)"
    },
    "3dElements" : {
      "store" : "3dElements",
      "query" : "SELECT element.ECClassId, element.ECInstanceId ElementId, element.UserLabel, element.CodeValue FROM bis.GeometricElement3d element"
    },
    "2dElements" : {
      "store" : "2dElements",
      "query" : "SELECT element.ECClassId, element.ECInstanceId ElementId, element.UserLabel, element.CodeValue FROM bis.GeometricElement2d element"
    },
    "volumeForSingleIds": {
      "info" : "The query above is the bare minimum, info and options may be null calculateMassProperties defaults to false, idColumn defaults to 0 and idColumnIsJsonArray defaults to false.  idColumn gives the position of the column which holds the ids to use when calculating the mass props.",
      "store" : "volumeForSingleIds",
      "query" : "SELECT ECInstanceId FROM BisCore.PhysicalElement LIMIT 100",
      "options" : {
        "calculateMassProperties" : true,
        "idColumn" : 0,
        "idColumnIsJsonArray" : false
      }
    },
    "volumeForGroupIds": {
      "store" : "volumeForGroupIds",
      "query" : "SELECT json_group_array(IdToHex(e.ECInstanceId)) as id_list, c.codevalue FROM bis.physicalElement e JOIN bis.Category c ON e.Category.Id = c.ECInstanceId GROUP BY e.Category.Id",
      "options" : {
        "calculateMassProperties" : true,
        "idColumn" : 0,
        "idColumnIsJsonArray" : true
      }
    }
  }
}
```

Running example queries file should create a new folder with a structure like this:

```fs
/out/example
    |-->schema.csv
    |-->class.csv
    |-->3dElements.csv
    |-->2dElements.csv
    |-->volumeForSingleIds.csv
    |-->volumeForGroupIds.csv
```

### Project Structure

The full folder structure of this app is explained below:

> **Note!** Make sure you have already built the app using `npm run build`

| Name | Description |
| ------------------------ | ---------------------------------------------------------------------------------------------|
| **.vscode**              | Contains VS Code specific settings                                                           |
| **.github**              | Contains Github related files                                                                |
| **lib**                  | Contains the distributable (or output) from your TypeScript build. This is the code you ship |
| **src**                  | Contains source code that will be compiled to the dist dir                                   |
| **src/tests**            | Contains tests for the project                                                               |
| **src/DataExporter.ts**  | Contains code responsible for executing queries and exporting results to csv files           |
| **src/Main.ts**          | Main entry point for executing queries against remote iModel                                 |
| **src/MainSnapshot.ts**  | Contains code responsible for executing queries on local snapshot                            |
| **queries**              | Designated place to store your query files                                                   |
| package.json             | File that contains npm dependencies as well as build scripts                                 |
| tsconfig.json            | Config settings for compiling server code written in TypeScript                              |

## Testing

To run tests use command

```sh
npm run test
```

It will create `TestiModel.bim` file and run test queries from TestQueries.json.

### Existing tests check

- CSV files are correctly generated from iModel.
- Should assign default values to query options, if options are not provided
- Should not assign default values to already defined options
- Should return object's volume as zero if it's volume is undefined
