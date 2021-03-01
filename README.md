# Introduction
![ci workflow](https://github.com/imodeljs/imodel-reporter/actions/workflows/ci.yaml/badge.svg)

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

A simple command line app to generate csv reports from an iModel
# Table of contents: 

- [Pre-reqs](#pre-reqs)
- [Getting started](#getting-started)
    - [Creating a test iModel](#creating-test-imodel)
    - [Client registration](#client-registration)
- [Data Exporter](#data-exporter)
    - [Query file structure](#query-file-structure)
    - [Example query](#example-query)
    - [Project Structure](#project-structure)
- [Testing](#testing)

# Pre-reqs
To build and run this app locally you will need a few things:
- Install [Git](https://git-scm.com/)
- Install [Node.js](https://nodejs.org/en/) v12 (must be greater than 12.10.x)
- Install [Typescript](https://www.typescriptlang.org/download)
- Install [VS Code](https://code.visualstudio.com/)

## Creating a test iModel
To successfully run this tool you will need to have an accessible iModel. If you don't have one already [this](https://www.itwinjs.org/learning/tutorials/create-test-imodel-sample/)  guide will help you to create it.
If you want to create iModel in your local environment then follow  [this](https://www.itwinjs.org/learning/tutorials/create-test-imodel-offline/) tutorial.

## Client application registration
Client application registration procedure can be found [here](https://www.itwinjs.org/learning/tutorials/registering-applications/)

# Getting started
- Clone the repository
```
git clone <github link>
```
- Install dependencies
```
cd <project_name>
npm install
```
- Build and run the project
```
npm run build
npm run start <query.json>           # Run with iModel from hub
```
To use iModel from your local machine
```
npm run start:snapshot <file path> <query.json>     # Run with local iModel
```

# Using Data Exporter
Detailed description of the project

## Query file structure

Query file structure below.

| Name | Description |
| ------------------------ | ---------------------------------------------------------------------------
| **name**           | name for your queries set                                                        |
| **description**    | description for your queries        				     	                        |
| **url**            | link to your iModel project  							                        |
| **folder**         | name of the folder where queries results will be saved                           |
| **queries**        | array for your queries						                                    |
| **store**          | file name in which query results will be stored                                  |
| **query**          | ECsql query to be executed        						                        |

### Example query

An example query file with four simple queries.

Example supports three types of queries: generic queries; calculating volume of single physical element; calculating total volume sum of group of elements. 
> **Note! <b>Don't forget to change url to accessible iModel if you want to run this example<b>**

```
{    
    "name": "example",
    "description": "simple example queries on how tool works",
    "url" : "https://connect-imodelweb.bentley.com/imodeljs/?projectId=<put your project id here>&iModelId=<put your model id here>&ChangeSetId=<put your changeset id here>",
    "folder" : "./example",
    "queries": {
        "generic": {
            "schema": {
                "store" : "schema",
                "query" : "SELECT DISTINCT schema.Name, schema.VersionMajor, schema.VersionWrite, schema.VersionMinor, schema.DisplayLabel, schema.Description FROM ECDbMeta.ECSchemaDef schema JOIN ECDbMeta.ECClassDef class ON class.Schema.Id = schema.ECInstanceId WHERE class.ECInstanceId in (SELECT DISTINCT(ECClassId) FROM Bis.Element)"
            },
            "classes" : {
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
            }
        },
        "volumeQueriesForSingleIds": {
            "singleIds": {
                "store" : "singleIds",
                "query" : "SELECT ECInstanceId FROM bis.PhysicalElement LIMIT 100"
            }
        },
        "volumeQueriesForGroupIds": {
			"groupedIds" : {
                "store" : "groupedIds",
                "query" : "SELECT json_group_array(IdToHex(e.ECInstanceId)) as id_list, c.codevalue FROM bis.physicalElement e JOIN bis.Category c ON e.Category.Id = c.ECInstanceId GROUP BY e.Category.Id"
            }
        }                
    }
}
```
Running example queries file should create a new folder with a structure like this:

```
/out/example
    |-->generic
        |-->schema.csv
        |-->classes.csv
        |-->3dElements.csv
        |-->2dElements.csv
    |-->volumeQueriesForSingleIds
        |-->singleIds
    |-->volumeQueriesForGroupIds
        |-->groupedIds
```

## Project Structure

The full folder structure of this app is explained below:

> **Note!** Make sure you have already built the app using `npm run build`

| Name | Description |
| ------------------------ | --------------------------------------------------------------------------------------------- 
| **.vscode**              | Contains VS Code specific settings                                                            |
| **.github**              | Contains Github related files        							                               |
| **lib**                  | Contains the distributable (or output) from your TypeScript build. This is the code you ship  |
| **src**                  | Contains source code that will be compiled to the dist dir                               	   |
| **src/tests**            | Contains tests for the project                                                                |
| **src/DataExporter.ts**  | Contains code responsible for executing queries and exporting results to csv files            |
| **src/Main.ts**          | Main entry point for executing queries against remote iModel   						       |
| **src/MainSnapshot.ts**  | Contains code responsible for executing queries on local snapshot                             |
| **queries**              | Designated place to store your query files					                                   |
| package.json             | File that contains npm dependencies as well as build scripts                                  |
| tsconfig.json            | Config settings for compiling server code written in TypeScript                               |
| .eslintrc                | Config settings for ESLint code style checking                                                |
| .eslintignore            | Config settings for paths to exclude from linting  			

## Testing

To run tests use command

```
npm run test
```

It will create TestiModel.bim file and run test queries from TestQueries.json.

### Existing tests check:
    * CSV files are correctly generated from imodel.
    * Should assign default values to query options, if options are not provided
    * Should not assign default values to already defined options
    * Should return object's volume as zero if it's volume is undefined